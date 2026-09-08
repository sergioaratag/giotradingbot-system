"""Simulador de ejecucion. Donde se decide si el backtest es honesto o no.

Reglas de ejecucion, todas conservadoras a proposito:

  1. Una señal generada al cierre de la vela t se ejecuta en la APERTURA de t+1.
     En vivo nadie opera al precio de cierre de la vela que recien cerro.

  2. Si en una vela el precio pudo tocar el stop Y el objetivo, se asume SIEMPRE
     que pego el stop. Sin datos de tick no hay forma de saber cual toco primero,
     y elegir el objetivo infla los resultados de una forma que despues no aparece
     en la cuenta real. Este supuesto se afloja unicamente si se corre con ticks.

  3. Gap contra la posicion: se llena en la apertura (peor que el stop).
     Gap a favor: se llena en el objetivo exacto, no en la apertura.
     El gap adverso se paga entero; el favorable no se cobra.

  4. Todo precio de ejecucion paga medio spread y slippage, siempre en contra.

  5. El stop movido por `manage()` al cierre de la vela t recien rige desde t+1.
     Moverlo dentro de la misma vela seria mover el stop sabiendo lo que ya paso.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..clock import is_rollover
from ..types import (
    Bar, ExitReason, Fill, Instrument, Position, Side, TakeProfit, Trade,
)
from .account import Account
from .costs import CostConfig


@dataclass(slots=True)
class PendingEntry:
    """Señal aceptada esperando la apertura de la proxima vela."""

    side: Side
    lots: float
    risk_amount_planned: float
    stop_loss: float
    take_profits: tuple[TakeProfit, ...]
    reason: str
    tags: dict
    signal_entry: float


class Broker:
    """Ejecuta ordenes y gestiona posiciones vela por vela."""

    def __init__(
        self,
        instrument: Instrument,
        account: Account,
        costs: CostConfig,
        allow_intrabar_best_case: bool = False,
    ) -> None:
        self.instrument = instrument
        self.account = account
        self.costs = costs
        self.allow_intrabar_best_case = allow_intrabar_best_case
        self.positions: list[Position] = []
        self._next_id = 1
        self._last_ts: datetime | None = None

    # ------------------------------------------------------------------ apertura
    def open_position(self, pending: PendingEntry, bar: Bar) -> Position:
        """Abre en la apertura de `bar`, pagando spread y slippage."""
        inst = self.instrument
        fill = self.costs.entry_price(
            pending.side, bar.open, bar.ts, bar.spread_mean, inst
        )
        commission = self.costs.commission(pending.lots)
        self.account.apply_cash(-commission)
        self.account.record_cost(commission)

        # El riesgo real se recalcula sobre el precio de entrada efectivo:
        # el spread ya se comio parte de la distancia al stop.
        risk_amount = abs(fill - pending.stop_loss) * pending.lots * inst.contract_size

        pos = Position(
            id=self._next_id,
            symbol=inst.symbol,
            side=pending.side,
            lots=pending.lots,
            entry_price=fill,
            entry_ts=bar.ts,
            stop_loss=pending.stop_loss,
            initial_stop=pending.stop_loss,
            take_profits=pending.take_profits,
            risk_amount=risk_amount,
            initial_lots=pending.lots,
            reason=pending.reason,
            tags=dict(pending.tags),
        )
        pos.tags["entry_commission"] = commission
        pos.tags["signal_entry"] = pending.signal_entry
        pos.tags["slippage_entry_pips"] = inst.pips(abs(fill - bar.open))
        pos.tags["mae_price"] = fill
        pos.tags["mfe_price"] = fill
        self._next_id += 1
        self.positions.append(pos)
        return pos

    # ------------------------------------------------------------------- barra
    def on_bar(self, bar: Bar) -> list[Trade]:
        """Procesa una vela contra todas las posiciones abiertas.

        Orden: swap -> gap de apertura -> stop -> objetivos -> excursiones.
        """
        closed: list[Trade] = []
        if self._last_ts is not None:
            for pos in list(self.positions):
                if is_rollover(self._last_ts, bar.ts):
                    swap = self.costs.swap(pos.side, pos.lots, bar.ts, self.instrument)
                    self.account.apply_cash(swap)
                    if swap < 0:
                        self.account.record_cost(swap)
                    pos.tags["swap_total"] = pos.tags.get("swap_total", 0.0) + swap
        self._last_ts = bar.ts

        for pos in list(self.positions):
            pos.bars_held += 1
            self._update_excursions(pos, bar)
            trade = self._check_exits(pos, bar)
            if trade is not None:
                closed.append(trade)
        return closed

    def _update_excursions(self, pos: Position, bar: Bar) -> None:
        if pos.side is Side.BUY:
            pos.tags["mae_price"] = min(pos.tags["mae_price"], bar.low)
            pos.tags["mfe_price"] = max(pos.tags["mfe_price"], bar.high)
        else:
            pos.tags["mae_price"] = max(pos.tags["mae_price"], bar.high)
            pos.tags["mfe_price"] = min(pos.tags["mfe_price"], bar.low)

    def _stop_hit(self, pos: Position, bar: Bar) -> tuple[bool, float]:
        """(toco_el_stop, precio_crudo_de_ejecucion) contemplando el gap."""
        if pos.side is Side.BUY:
            if bar.open <= pos.stop_loss:
                return True, bar.open           # gap por debajo: se llena peor
            if bar.low <= pos.stop_loss:
                return True, pos.stop_loss
        else:
            if bar.open >= pos.stop_loss:
                return True, bar.open
            if bar.high >= pos.stop_loss:
                return True, pos.stop_loss
        return False, 0.0

    def _tp_hit(self, pos: Position, tp: TakeProfit, bar: Bar) -> bool:
        if pos.side is Side.BUY:
            return bar.high >= tp.price
        return bar.low <= tp.price

    def _check_exits(self, pos: Position, bar: Bar) -> Trade | None:
        stop_hit, stop_raw = self._stop_hit(pos, bar)
        tps_hit = [tp for tp in pos.take_profits if self._tp_hit(pos, tp, bar)]

        # Peor caso: si el stop y algun objetivo caben en la misma vela, gana el stop.
        if stop_hit and (not tps_hit or not self.allow_intrabar_best_case):
            return self._close(pos, bar, stop_raw, ExitReason.STOP_LOSS, is_stop=True)

        if tps_hit:
            remaining = pos.take_profits
            for tp in tps_hit:
                if tp.fraction >= 1.0 - 1e-9:
                    return self._close(pos, bar, tp.price, ExitReason.TAKE_PROFIT)
                self._close_partial(pos, bar, tp)
                remaining = tuple(t for t in remaining if t is not tp)
            pos.take_profits = remaining
            if pos.lots <= 1e-9:
                return self._close(pos, bar, tps_hit[-1].price, ExitReason.TAKE_PROFIT)
        return None

    # ------------------------------------------------------------------- cierres
    def _close_partial(self, pos: Position, bar: Bar, tp: TakeProfit) -> None:
        inst = self.instrument
        lots = inst.round_lot(pos.initial_lots * tp.fraction)
        lots = min(lots, pos.lots)
        if lots <= 0:
            return
        price = self.costs.exit_price(pos.side, tp.price, bar.ts, bar.spread_mean, inst)
        pnl = (price - pos.entry_price) * pos.side.sign * lots * inst.contract_size
        commission = self.costs.commission(lots)
        self.account.apply_cash(pnl - commission)
        self.account.record_cost(commission)
        pos.realized_pnl += pnl - commission
        pos.lots = round(pos.lots - lots, 8)
        pos.partial_fills.append(Fill(bar.ts, price, lots, f"TP parcial @ {tp.price:.5f}"))

    def close_position(
        self, pos: Position, bar: Bar, reason: ExitReason, price: float | None = None
    ) -> Trade:
        """Cierre solicitado por la estrategia o por el motor (no por SL/TP)."""
        return self._close(pos, bar, price if price is not None else bar.close, reason)

    def _close(
        self, pos: Position, bar: Bar, raw_price: float,
        reason: ExitReason, is_stop: bool = False,
    ) -> Trade:
        inst = self.instrument
        price = self.costs.exit_price(pos.side, raw_price, bar.ts, bar.spread_mean, inst, is_stop)
        lots = pos.lots
        pnl = (price - pos.entry_price) * pos.side.sign * lots * inst.contract_size
        commission = self.costs.commission(lots)
        self.account.apply_cash(pnl - commission)
        self.account.record_cost(commission)

        gross = pnl + pos.realized_pnl
        entry_comm = pos.tags.get("entry_commission", 0.0)
        swap_total = pos.tags.get("swap_total", 0.0)
        total_costs = commission + entry_comm - swap_total
        net = pos.realized_pnl + pnl + swap_total
        r = net / pos.risk_amount if pos.risk_amount > 0 else 0.0

        risk_dist = pos.initial_risk_distance
        mae_r = mfe_r = 0.0
        if risk_dist > 0:
            mae_r = (pos.tags["mae_price"] - pos.entry_price) * pos.side.sign / risk_dist
            mfe_r = (pos.tags["mfe_price"] - pos.entry_price) * pos.side.sign / risk_dist

        if pos in self.positions:
            self.positions.remove(pos)

        trade = Trade(
            id=pos.id, symbol=pos.symbol, side=pos.side,
            entry_ts=pos.entry_ts, exit_ts=bar.ts,
            entry_price=pos.entry_price, exit_price=price,
            initial_stop=pos.initial_stop, lots=pos.initial_lots,
            gross_pnl=gross, costs=total_costs, net_pnl=net,
            r_multiple=r, risk_amount=pos.risk_amount,
            exit_reason=reason, reason=pos.reason, bars_held=pos.bars_held,
            mae_r=round(mae_r, 3), mfe_r=round(mfe_r, 3),
            tags=dict(pos.tags),
        )
        self.account.record_trade(trade)
        return trade

    # ------------------------------------------------------------------- estado
    def open_pnl(self, price: float) -> float:
        cs = self.instrument.contract_size
        return sum(p.unrealized_pnl(price, cs) + p.realized_pnl for p in self.positions)

    def move_stop(self, pos: Position, new_stop: float) -> bool:
        """Mover el stop solo en la direccion de proteger. Nunca alejarlo."""
        if pos.side is Side.BUY and new_stop > pos.stop_loss:
            pos.stop_loss = new_stop
            return True
        if pos.side is Side.SELL and new_stop < pos.stop_loss:
            pos.stop_loss = new_stop
            return True
        return False
