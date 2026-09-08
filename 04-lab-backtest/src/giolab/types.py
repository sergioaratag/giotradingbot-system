"""Tipos base del laboratorio.

Todo lo que cruza la frontera estrategia <-> motor pasa por aca.
Regla de oro del modulo: los timestamps SIEMPRE son UTC y timezone-aware.
La conversion a hora de Nueva York vive unicamente en clock.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

    @property
    def sign(self) -> int:
        return 1 if self is Side.BUY else -1

    @property
    def opposite(self) -> "Side":
        return Side.SELL if self is Side.BUY else Side.BUY


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP = "STOP"


class ExitReason(str, Enum):
    STOP_LOSS = "STOP_LOSS"
    TAKE_PROFIT = "TAKE_PROFIT"
    STRATEGY = "STRATEGY"
    TIME_STOP = "TIME_STOP"
    END_OF_DATA = "END_OF_DATA"
    RISK_HALT = "RISK_HALT"


class Session(str, Enum):
    """Sesiones en hora de Nueva York. Ver clock.session_of()."""

    ASIA = "ASIA"
    LONDON = "LONDON"
    OVERLAP = "OVERLAP"
    NEW_YORK = "NEW_YORK"
    OFF = "OFF"


@dataclass(frozen=True, slots=True)
class Instrument:
    """Definicion de un par. Todo lo que el motor necesita saber del simbolo."""

    symbol: str
    pip_size: float = 0.0001          # 1 pip en unidades de precio
    point_size: float = 0.00001       # 1 punto (minimo incremento cotizado)
    contract_size: float = 100_000.0  # unidades de divisa base por lote
    min_lot: float = 0.01
    lot_step: float = 0.01
    max_lot: float = 100.0
    quote_ccy: str = "USD"
    digits: int = 5

    def pips(self, price_delta: float) -> float:
        return price_delta / self.pip_size

    def price(self, pips: float) -> float:
        return pips * self.pip_size

    def round_lot(self, lot: float) -> float:
        """Redondea SIEMPRE hacia abajo: nunca arriesgar mas de lo pedido."""
        if lot <= 0:
            return 0.0
        steps = int(lot / self.lot_step + 1e-9)
        return max(0.0, min(self.max_lot, round(steps * self.lot_step, 8)))


EURUSD = Instrument("EURUSD")
GBPUSD = Instrument("GBPUSD")

INSTRUMENTS: dict[str, Instrument] = {i.symbol: i for i in (EURUSD, GBPUSD)}


@dataclass(frozen=True, slots=True)
class Bar:
    """Una vela cerrada. `ts` es el timestamp de APERTURA, en UTC."""

    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    spread_mean: float = 0.0  # en puntos (point_size), promedio dentro de la vela
    spread_max: float = 0.0   # en puntos, maximo dentro de la vela

    @property
    def range(self) -> float:
        return self.high - self.low


@dataclass(frozen=True, slots=True)
class TakeProfit:
    """Un objetivo parcial. `fraction` es la porcion de la posicion a cerrar."""

    price: float
    fraction: float = 1.0


@dataclass(frozen=True, slots=True)
class Signal:
    """Lo que la estrategia devuelve cuando quiere abrir una posicion.

    `reason` NO es decorativo: es lo que permite auditar trade por trade
    seis meses despues. Sin motivo legible, el trade no se puede revisar.
    """

    side: Side
    entry: float
    stop_loss: float
    take_profits: tuple[TakeProfit, ...] = ()
    risk_pct: float | None = None          # None -> usa el default del RiskConfig
    order_type: OrderType = OrderType.MARKET
    expires_after_bars: int | None = None  # solo para LIMIT/STOP pendientes
    reason: str = ""
    tags: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.reason.strip():
            raise ValueError(
                "Signal.reason es obligatorio: un trade sin motivo legible no se puede auditar."
            )
        if self.side is Side.BUY and self.stop_loss >= self.entry:
            raise ValueError(f"BUY con SL {self.stop_loss} >= entrada {self.entry}")
        if self.side is Side.SELL and self.stop_loss <= self.entry:
            raise ValueError(f"SELL con SL {self.stop_loss} <= entrada {self.entry}")
        for tp in self.take_profits:
            if self.side is Side.BUY and tp.price <= self.entry:
                raise ValueError(f"BUY con TP {tp.price} <= entrada {self.entry}")
            if self.side is Side.SELL and tp.price >= self.entry:
                raise ValueError(f"SELL con TP {tp.price} >= entrada {self.entry}")
        total = sum(tp.fraction for tp in self.take_profits)
        if total > 1.0 + 1e-9:
            raise ValueError(f"Las fracciones de TP suman {total:.3f} > 1.0")

    @property
    def risk_distance(self) -> float:
        return abs(self.entry - self.stop_loss)


class ActionKind(str, Enum):
    MOVE_STOP = "MOVE_STOP"
    CLOSE = "CLOSE"
    CLOSE_PARTIAL = "CLOSE_PARTIAL"
    NOTHING = "NOTHING"


@dataclass(frozen=True, slots=True)
class Action:
    """Lo que la estrategia devuelve al gestionar una posicion abierta."""

    kind: ActionKind
    new_stop: float | None = None
    fraction: float = 1.0
    reason: str = ""


@dataclass(slots=True)
class Fill:
    ts: datetime
    price: float
    lots: float
    reason: str = ""


@dataclass(slots=True)
class Position:
    """Posicion abierta. El motor la muta; la estrategia solo la lee."""

    id: int
    symbol: str
    side: Side
    lots: float
    entry_price: float          # precio de entrada efectivo (ya con costos de entrada)
    entry_ts: datetime
    stop_loss: float
    initial_stop: float
    take_profits: tuple[TakeProfit, ...]
    risk_amount: float          # dinero arriesgado al abrir (define 1R)
    initial_lots: float
    reason: str
    bars_held: int = 0
    realized_pnl: float = 0.0   # de cierres parciales
    partial_fills: list[Fill] = field(default_factory=list)
    tags: dict[str, Any] = field(default_factory=dict)

    @property
    def initial_risk_distance(self) -> float:
        return abs(self.entry_price - self.initial_stop)

    def unrealized_pnl(self, price: float, contract_size: float) -> float:
        return (price - self.entry_price) * self.side.sign * self.lots * contract_size

    def r_multiple_at(self, price: float, contract_size: float) -> float:
        if self.risk_amount <= 0:
            return 0.0
        total = self.realized_pnl + self.unrealized_pnl(price, contract_size)
        return total / self.risk_amount


@dataclass(slots=True)
class Trade:
    """Una operacion cerrada. Es la unidad de analisis de todo el reporte."""

    id: int
    symbol: str
    side: Side
    entry_ts: datetime
    exit_ts: datetime
    entry_price: float
    exit_price: float
    initial_stop: float
    lots: float
    gross_pnl: float
    costs: float
    net_pnl: float
    r_multiple: float
    risk_amount: float
    exit_reason: ExitReason
    reason: str
    bars_held: int
    mae_r: float = 0.0  # maximum adverse excursion en R
    mfe_r: float = 0.0  # maximum favorable excursion en R
    session: str = ""
    regime: dict[str, str] = field(default_factory=dict)
    tags: dict[str, Any] = field(default_factory=dict)
