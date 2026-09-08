"""El motor. Event-driven, vela por vela, multi-simbolo.

Secuencia dentro de cada vela (el orden importa mas que cualquier otra cosa
de este archivo):

  1. Ejecutar las entradas pendientes en la APERTURA de la vela. Fueron decididas
     al cierre de la vela anterior.
  2. Procesar stops y objetivos contra el rango de la vela, peor caso primero.
  3. Marcar a mercado y evaluar los limites de prop firm con el PEOR equity que
     tuvo la vela, no con el del cierre. Una prop firm mide en tiempo real: si el
     equity toco el limite a mitad de vela, la cuenta ya estaba violada aunque
     cerrara arriba.
  4. Recien en el CIERRE de la vela: construir el contexto, llamar manage() sobre
     cada posicion abierta y despues on_bar() para buscar entrada nueva.
  5. Lo que on_bar() devuelva queda pendiente para la apertura de la vela siguiente.

En ningun punto de esa secuencia la estrategia ve un dato posterior a su `now`.
"""

from __future__ import annotations

import copy
import inspect
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Sequence

import numpy as np
import pandas as pd

from ..clock import UTC, session_of
from ..context import MarketContext, TimeframeData
from ..resample import TIMEFRAMES, resample
from ..strategy import Strategy
from ..types import (
    Action, ActionKind, Bar, ExitReason, Instrument, INSTRUMENTS, Position,
    Side, Signal, Trade,
)
from .account import Account, EquityPoint
from .broker import Broker, PendingEntry
from .costs import CostConfig
from .risk import PositionSizer, PropFirmConfig, PropFirmMonitor, RiskConfig, correlated_with


def _instantiate(strategy: Strategy | Callable[[], Strategy]) -> Strategy:
    """Una estrategia fresca por simbolo, para que su estado no se mezcle.

    Se acepta una clase, una funcion que devuelva una estrategia, o una instancia
    ya construida (que se clona). Un `hasattr(x, "on_bar")` no alcanza para
    distinguirlas: una CLASE tambien tiene ese atributo, y tratarla como instancia
    termina pasandole la clase al motor en vez de un objeto.
    """
    if inspect.isclass(strategy):
        return strategy()
    if callable(strategy) and not hasattr(strategy, "on_bar"):
        return strategy()
    return copy.deepcopy(strategy)


@dataclass(slots=True)
class EngineConfig:
    initial_balance: float = 10_000.0
    costs: CostConfig = field(default_factory=CostConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    prop_firm: PropFirmConfig = field(default_factory=PropFirmConfig)
    close_all_on_max_dd: bool = True
    close_open_at_end: bool = True
    warmup_bars: int = 200  # velas base sin operar, para que los indicadores carguen

    def __post_init__(self) -> None:
        self.prop_firm.initial_balance = self.initial_balance


@dataclass(slots=True)
class BacktestResult:
    trades: list[Trade]
    equity_curve: list[EquityPoint]
    rejections: list[dict]
    initial_balance: float
    final_balance: float
    final_equity: float
    total_costs: float
    prop_firm: PropFirmMonitor
    symbols: list[str]
    strategy_name: str
    bars_processed: int
    start: datetime | None
    end: datetime | None

    def trades_dataframe(self) -> pd.DataFrame:
        if not self.trades:
            return pd.DataFrame()
        rows = []
        for t in self.trades:
            rows.append({
                "id": t.id, "symbol": t.symbol, "side": t.side.value,
                "entry_ts": t.entry_ts, "exit_ts": t.exit_ts,
                "entry_price": t.entry_price, "exit_price": t.exit_price,
                "initial_stop": t.initial_stop, "lots": t.lots,
                "gross_pnl": t.gross_pnl, "costs": t.costs, "net_pnl": t.net_pnl,
                "r_multiple": t.r_multiple, "risk_amount": t.risk_amount,
                "exit_reason": t.exit_reason.value, "reason": t.reason,
                "bars_held": t.bars_held, "mae_r": t.mae_r, "mfe_r": t.mfe_r,
                "session": t.session, **{f"regime_{k}": v for k, v in t.regime.items()},
            })
        return pd.DataFrame(rows)

    def equity_dataframe(self) -> pd.DataFrame:
        return pd.DataFrame([
            {"ts": p.ts, "balance": p.balance, "equity": p.equity,
             "open_positions": p.open_positions}
            for p in self.equity_curve
        ])


class _SymbolState:
    """Todo lo que el motor lleva por simbolo."""

    __slots__ = ("symbol", "instrument", "strategy", "broker", "tfs",
                 "base", "base_close_ts", "pending", "n_bars")

    def __init__(self, symbol: str, instrument: Instrument, strategy: Strategy,
                 broker: Broker, tfs: dict[str, TimeframeData], base: TimeframeData) -> None:
        self.symbol = symbol
        self.instrument = instrument
        self.strategy = strategy
        self.broker = broker
        self.tfs = tfs
        self.base = base
        self.base_close_ts = base.ts_close
        self.pending: PendingEntry | None = None
        self.n_bars = base.n_total


def _close_timestamps(df: pd.DataFrame, timeframe: str) -> np.ndarray:
    """Hora de cierre de cada vela: apertura de la siguiente.

    La ultima vela se cierra con su duracion nominal. Para D1 la duracion es
    variable (rollover con DST), asi que se usa la apertura siguiente cuando existe.
    """
    opens = df.index.values.astype("datetime64[ns]")
    if len(opens) == 0:
        return opens
    nominal = np.timedelta64(TIMEFRAMES[timeframe] * 60, "s").astype("timedelta64[ns]")
    closes = np.empty_like(opens)
    closes[:-1] = opens[1:]
    closes[-1] = opens[-1] + nominal
    if timeframe != "D1":
        # Con huecos (fin de semana), la apertura siguiente esta muy lejos; el cierre
        # real es apertura + duracion nominal. Se toma el minimo de los dos.
        closes = np.minimum(closes, opens + nominal)
    return closes


class Backtest:
    """Corre una estrategia sobre uno o varios simbolos."""

    def __init__(
        self,
        strategy: Strategy | Callable[[], Strategy],
        data: dict[str, pd.DataFrame],
        config: EngineConfig | None = None,
        instruments: dict[str, Instrument] | None = None,
    ) -> None:
        if not data:
            raise ValueError("No hay datos para correr el backtest")
        self.config = config or EngineConfig()
        self.account = Account(self.config.initial_balance)
        self.sizer = PositionSizer(self.config.risk)
        self.monitor = PropFirmMonitor(self.config.prop_firm)
        self._instruments = {**INSTRUMENTS, **(instruments or {})}
        self._states: dict[str, _SymbolState] = {}
        self._last_price: dict[str, float] = {}
        self._strategy_name = ""

        for symbol, df_m1 in data.items():
            strat = _instantiate(strategy)
            self._strategy_name = strat.name
            inst = self._instruments.get(symbol)
            if inst is None:
                raise KeyError(f"Instrumento desconocido: {symbol}. Agregalo en types.INSTRUMENTS.")
            tfs: dict[str, TimeframeData] = {}
            for tf in dict.fromkeys(t.upper() for t in strat.required_timeframes):
                df_tf = resample(df_m1, tf)
                tfs[tf] = TimeframeData(tf, df_tf, _close_timestamps(df_tf, tf))
            base_tf = strat.required_timeframes[0].upper()
            broker = Broker(inst, self.account, self.config.costs)
            if hasattr(strat, "on_start"):
                strat.on_start(symbol)
            self._states[symbol] = _SymbolState(symbol, inst, strat, broker, tfs, tfs[base_tf])

    # --------------------------------------------------------------------- run
    def run(self) -> BacktestResult:
        timeline = self._build_timeline()
        bars_processed = 0
        halted = False

        for close64, symbol, idx in timeline:
            st = self._states[symbol]
            bar = self._bar_at(st.base, idx)
            close_ts = pd.Timestamp(close64).tz_localize(UTC).to_pydatetime()

            # 1. entradas pendientes, en la apertura de esta vela
            if st.pending is not None and not halted:
                ok, why = self.monitor.can_open()
                if ok:
                    st.broker.open_position(st.pending, bar)
                else:
                    self.account.record_rejection(bar.ts, symbol, "prop_firm", why)
                st.pending = None
            elif st.pending is not None:
                st.pending = None

            # 2. stops y objetivos contra el rango de esta vela
            closed = st.broker.on_bar(bar)
            for t in closed:
                t.session = session_of(t.exit_ts).value

            # 3. marcar a mercado con el peor equity de la vela y evaluar limites
            self._last_price[symbol] = bar.close
            worst_equity = self._worst_equity(symbol, bar)
            self.monitor.update(close_ts, self.account.balance, worst_equity)
            if self.monitor.blown and self.config.close_all_on_max_dd and not halted:
                self._close_everything(bar, ExitReason.RISK_HALT)
                halted = True
            self.account.mark_to_market(close_ts, self._open_pnl_all(), self._n_open())

            # 4. cierre de vela: manage() y despues on_bar()
            if not halted:
                self._on_close(st, bar, close_ts, close64, idx)
            bars_processed += 1

        self._finalize()
        return self._build_result(bars_processed, timeline)

    # ----------------------------------------------------------------- interno
    def _build_timeline(self) -> list[tuple[np.datetime64, str, int]]:
        events: list[tuple[np.datetime64, str, int]] = []
        for symbol, st in self._states.items():
            for i in range(st.n_bars):
                events.append((st.base_close_ts[i], symbol, i))
        events.sort(key=lambda e: (e[0], e[1]))
        return events

    @staticmethod
    def _bar_at(data: TimeframeData, i: int) -> Bar:
        c = data.cols
        ts = pd.Timestamp(data.ts_open[i]).tz_localize(UTC).to_pydatetime()
        return Bar(
            ts=ts, open=float(c["open"][i]), high=float(c["high"][i]),
            low=float(c["low"][i]), close=float(c["close"][i]),
            volume=float(c["volume"][i]) if "volume" in c else 0.0,
            spread_mean=float(c["spread_mean"][i]) if "spread_mean" in c else 0.0,
            spread_max=float(c["spread_max"][i]) if "spread_max" in c else 0.0,
        )

    def _worst_equity(self, symbol: str, bar: Bar) -> float:
        """Equity en el punto mas adverso de la vela.

        Para el simbolo de esta vela se usa el extremo que va en contra de cada
        posicion (low si esta comprado, high si esta vendido). Para los demas
        simbolos se usa su ultimo precio conocido, porque su vela todavia no
        ocurrio en la linea de tiempo.
        """
        total = self.account.balance
        for sym, st in self._states.items():
            cs = st.instrument.contract_size
            for p in st.broker.positions:
                if sym == symbol:
                    price = bar.low if p.side is Side.BUY else bar.high
                else:
                    price = self._last_price.get(sym, p.entry_price)
                total += p.unrealized_pnl(price, cs) + p.realized_pnl
        return total

    def _open_pnl_all(self) -> float:
        """PnL abierto marcado con el ultimo precio conocido de cada simbolo."""
        total = 0.0
        for sym, st in self._states.items():
            price = self._last_price.get(sym)
            if price is None:
                continue
            total += st.broker.open_pnl(price)
        return total

    def _n_open(self) -> int:
        return sum(len(st.broker.positions) for st in self._states.values())

    def _all_positions(self) -> list[Position]:
        return [p for st in self._states.values() for p in st.broker.positions]

    def _close_everything(self, bar: Bar, reason: ExitReason) -> None:
        for st in self._states.values():
            for p in list(st.broker.positions):
                t = st.broker.close_position(p, bar, reason)
                t.session = session_of(t.exit_ts).value

    def _on_close(self, st: _SymbolState, bar: Bar, close_ts: datetime,
                  close64: np.datetime64, idx: int) -> None:
        ctx = MarketContext(
            symbol=st.symbol, instrument=st.instrument, now=close_ts, now64=close64,
            tfs=st.tfs, base_timeframe=st.base.timeframe,
            account=self.account, positions=self._all_positions(),
        )

        # gestion de lo abierto
        for pos in list(st.broker.positions):
            action = st.strategy.manage(ctx, pos)
            if action is None or action.kind is ActionKind.NOTHING:
                continue
            if action.kind is ActionKind.MOVE_STOP and action.new_stop is not None:
                st.broker.move_stop(pos, action.new_stop)
            elif action.kind is ActionKind.CLOSE:
                t = st.broker.close_position(pos, bar, ExitReason.STRATEGY)
                t.session = session_of(t.exit_ts).value
            elif action.kind is ActionKind.CLOSE_PARTIAL:
                from ..types import TakeProfit
                st.broker._close_partial(pos, bar, TakeProfit(bar.close, action.fraction))

        if idx < self.config.warmup_bars:
            return

        signal = st.strategy.on_bar(ctx)
        if signal is None:
            return
        pending = self._validate(st, signal, bar)
        if pending is not None:
            st.pending = pending

    def _validate(self, st: _SymbolState, sig: Signal, bar: Bar) -> PendingEntry | None:
        """Filtros del motor. Todo rechazo queda registrado con su motivo."""
        rej = self.account.record_rejection
        cfg = self.config.risk

        ok, why = self.monitor.can_open()
        if not ok:
            rej(bar.ts, st.symbol, "prop_firm", why)
            return None
        if len(st.broker.positions) >= cfg.max_positions_per_symbol:
            rej(bar.ts, st.symbol, "max_por_simbolo", f"ya hay {len(st.broker.positions)}")
            return None
        if self._n_open() >= cfg.max_concurrent_positions:
            rej(bar.ts, st.symbol, "max_concurrentes", f"ya hay {self._n_open()}")
            return None

        group = correlated_with(st.symbol)
        corr_risk = sum(
            p.risk_amount for p in self._all_positions() if p.symbol in group
        )
        risk_pct = sig.risk_pct if sig.risk_pct is not None else cfg.default_risk_pct
        limit = self.account.equity * cfg.max_correlated_risk_pct / 100.0
        planned = self.account.equity * risk_pct / 100.0
        if corr_risk + planned > limit + 1e-9:
            rej(bar.ts, st.symbol, "riesgo_correlacionado",
                f"abierto {corr_risk:.2f} + nuevo {planned:.2f} > limite {limit:.2f} "
                f"en {sorted(group)}")
            return None

        lots, risk_amount, why_size = self.sizer.lots_for(
            self.account.equity, risk_pct, sig.entry, sig.stop_loss, st.instrument
        )
        if why_size is not None:
            rej(bar.ts, st.symbol, "sizing", why_size)
            return None

        return PendingEntry(
            side=sig.side, lots=lots, risk_amount_planned=risk_amount,
            stop_loss=sig.stop_loss, take_profits=sig.take_profits,
            reason=sig.reason, tags=dict(sig.tags), signal_entry=sig.entry,
        )

    def _finalize(self) -> None:
        if not self.config.close_open_at_end:
            return
        for st in self._states.values():
            if not st.broker.positions:
                continue
            last = self._bar_at(st.base, st.n_bars - 1)
            for p in list(st.broker.positions):
                t = st.broker.close_position(p, last, ExitReason.END_OF_DATA)
                t.session = session_of(t.exit_ts).value

    def _build_result(self, bars: int, timeline: list) -> BacktestResult:
        trades = sorted(self.account.trades, key=lambda t: t.exit_ts)
        start = pd.Timestamp(timeline[0][0]).tz_localize(UTC).to_pydatetime() if timeline else None
        end = pd.Timestamp(timeline[-1][0]).tz_localize(UTC).to_pydatetime() if timeline else None
        return BacktestResult(
            trades=trades,
            equity_curve=self.account.equity_curve,
            rejections=self.account.rejections,
            initial_balance=self.account.initial_balance,
            final_balance=self.account.balance,
            final_equity=self.account.equity,
            total_costs=self.account.total_costs,
            prop_firm=self.monitor,
            symbols=sorted(self._states),
            strategy_name=self._strategy_name,
            bars_processed=bars,
            start=start, end=end,
        )

