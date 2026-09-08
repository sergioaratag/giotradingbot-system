"""Sizing y reglas de prop firm.

Dos responsabilidades separadas a proposito:
  - PositionSizer: cuantos lotes para arriesgar X% con este stop.
  - PropFirmRules: cuando el motor tiene PROHIBIDO abrir, y cuando hay que
    cerrar todo porque se violo un limite.

La segunda es la que mata cuentas de evaluacion. Un sistema con edge positivo
puede reprobar una prop firm por pegarle al drawdown diario en una sola mala
racha. Simularlo aca es mas barato que descubrirlo con plata.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from ..clock import ny_session_day
from ..types import Instrument, Side


@dataclass(slots=True)
class RiskConfig:
    default_risk_pct: float = 0.5        # % del equity por trade
    max_risk_pct: float = 1.0            # tope duro
    max_concurrent_positions: int = 2
    max_positions_per_symbol: int = 1
    max_correlated_risk_pct: float = 1.0  # riesgo abierto combinado en pares correlacionados
    min_stop_pips: float = 3.0           # stops mas chicos que esto son ruido, no señal
    max_stop_pips: float = 80.0          # stops mas grandes hacen el sizing incoherente


# Pares que se mueven juntos. Abrir EURUSD y GBPUSD del mismo lado es, en la
# practica, un solo trade al doble de tamano. El sistema anterior no lo miraba.
CORRELATED_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({"EURUSD", "GBPUSD"}),
)


def correlated_with(symbol: str) -> frozenset[str]:
    for group in CORRELATED_GROUPS:
        if symbol in group:
            return group
    return frozenset({symbol})


class PositionSizer:
    """Traduce "arriesgar X% con el stop en Y" a lotes."""

    def __init__(self, config: RiskConfig) -> None:
        self.config = config

    def lots_for(
        self, equity: float, risk_pct: float, entry: float, stop: float,
        instrument: Instrument,
    ) -> tuple[float, float, str | None]:
        """Devuelve (lotes, dinero_arriesgado, motivo_de_rechazo)."""
        if equity <= 0:
            return 0.0, 0.0, "equity <= 0"
        risk_pct = min(risk_pct, self.config.max_risk_pct)
        if risk_pct <= 0:
            return 0.0, 0.0, "riesgo <= 0"

        stop_distance = abs(entry - stop)
        stop_pips = stop_distance / instrument.pip_size
        if stop_pips < self.config.min_stop_pips:
            return 0.0, 0.0, f"stop de {stop_pips:.1f} pips < minimo {self.config.min_stop_pips}"
        if stop_pips > self.config.max_stop_pips:
            return 0.0, 0.0, f"stop de {stop_pips:.1f} pips > maximo {self.config.max_stop_pips}"

        risk_money = equity * risk_pct / 100.0
        # Para pares con USD de cotizacion, 1 lote mueve contract_size USD por unidad de precio.
        value_per_price_unit = instrument.contract_size
        raw_lots = risk_money / (stop_distance * value_per_price_unit)
        lots = instrument.round_lot(raw_lots)
        if lots < instrument.min_lot:
            return 0.0, 0.0, (
                f"lotes calculados {raw_lots:.4f} < minimo {instrument.min_lot} "
                f"(equity {equity:.0f}, riesgo {risk_pct}%, stop {stop_pips:.1f} pips)"
            )
        # El riesgo real es el del lote redondeado, no el pedido.
        actual_risk = lots * stop_distance * value_per_price_unit
        return lots, actual_risk, None


@dataclass(slots=True)
class PropFirmConfig:
    """Reglas tipo evaluacion de prop firm. Defaults estilo Orion/FTMO."""

    enabled: bool = True
    initial_balance: float = 10_000.0
    daily_drawdown_pct: float = 4.0       # sobre el balance de inicio del dia
    max_drawdown_pct: float = 8.0
    trailing_max_drawdown: bool = False   # True = el tope sube con el equity maximo
    daily_dd_from_equity_peak: bool = False  # True = mide desde el pico del dia, mas duro
    profit_target_pct: float | None = 8.0
    stop_trading_on_daily_breach: bool = True


class PropFirmMonitor:
    """Lleva la cuenta de los limites. Fuente unica de verdad sobre si se puede operar.

    El dia de trading es el de la sesion NY (rollover 17:00), no la fecha del
    calendario. Medirlo por fecha UTC corre el corte cinco o seis horas y hace
    que el drawdown diario de un numero que la prop firm no reconoce.
    """

    def __init__(self, config: PropFirmConfig) -> None:
        self.config = config
        self.day: date | None = None
        self.day_start_balance = config.initial_balance
        self.day_peak_equity = config.initial_balance
        self.global_peak_equity = config.initial_balance
        self.daily_breached = False
        self.max_breached = False
        self.target_reached = False
        self.breaches: list[dict] = []
        self.worst_daily_dd_pct = 0.0

    def on_new_day(self, day: date, balance: float, equity: float) -> None:
        self.day = day
        self.day_start_balance = balance
        self.day_peak_equity = equity
        self.daily_breached = False

    def sync_day(self, ts: datetime, balance: float, equity: float) -> None:
        day = ny_session_day(ts)
        if self.day != day:
            self.on_new_day(day, balance, equity)

    def daily_limit(self) -> float:
        base = self.day_peak_equity if self.config.daily_dd_from_equity_peak else self.day_start_balance
        return base * (1.0 - self.config.daily_drawdown_pct / 100.0)

    def max_limit(self) -> float:
        base = (
            self.global_peak_equity
            if self.config.trailing_max_drawdown
            else self.config.initial_balance
        )
        return base * (1.0 - self.config.max_drawdown_pct / 100.0)

    def update(self, ts: datetime, balance: float, equity: float) -> None:
        if not self.config.enabled:
            return
        self.sync_day(ts, balance, equity)
        self.day_peak_equity = max(self.day_peak_equity, equity)
        self.global_peak_equity = max(self.global_peak_equity, equity)

        base = self.day_peak_equity if self.config.daily_dd_from_equity_peak else self.day_start_balance
        if base > 0:
            dd = (base - equity) / base * 100.0
            self.worst_daily_dd_pct = max(self.worst_daily_dd_pct, dd)

        if equity <= self.daily_limit() and not self.daily_breached:
            self.daily_breached = True
            self.breaches.append(
                {"ts": ts, "kind": "DAILY_DD", "equity": equity, "limit": self.daily_limit()}
            )
        if equity <= self.max_limit() and not self.max_breached:
            self.max_breached = True
            self.breaches.append(
                {"ts": ts, "kind": "MAX_DD", "equity": equity, "limit": self.max_limit()}
            )
        if self.config.profit_target_pct is not None and not self.target_reached:
            target = self.config.initial_balance * (1 + self.config.profit_target_pct / 100.0)
            if equity >= target:
                self.target_reached = True

    @property
    def blown(self) -> bool:
        """Cuenta perdida: el max drawdown no se recupera nunca."""
        return self.config.enabled and self.max_breached

    def can_open(self) -> tuple[bool, str]:
        if not self.config.enabled:
            return True, ""
        if self.max_breached:
            return False, "max drawdown violado: cuenta perdida"
        if self.daily_breached and self.config.stop_trading_on_daily_breach:
            return False, "daily drawdown violado: no se opera hasta el proximo dia"
        return True, ""
