"""La cuenta: balance, equity, y el registro de todo lo que paso."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..types import Position, Trade


@dataclass(slots=True)
class EquityPoint:
    ts: datetime
    balance: float
    equity: float
    open_positions: int


class Account:
    """Balance realizado + equity marcado a mercado.

    La distincion importa: el drawdown de una prop firm se mide sobre EQUITY, no
    sobre balance. Una posicion abierta perdiendo -3% ya viola el limite diario
    aunque no se haya cerrado nada.
    """

    def __init__(self, initial_balance: float = 10_000.0) -> None:
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.equity = initial_balance
        self.trades: list[Trade] = []
        self.equity_curve: list[EquityPoint] = []
        self.rejections: list[dict] = []
        self.total_costs = 0.0

    def mark_to_market(self, ts: datetime, open_pnl: float, n_open: int) -> None:
        self.equity = self.balance + open_pnl
        self.equity_curve.append(EquityPoint(ts, self.balance, self.equity, n_open))

    def apply_cash(self, amount: float) -> None:
        """Movimiento de caja realizado (pnl de cierre, comision, swap)."""
        self.balance += amount

    def record_cost(self, amount: float) -> None:
        self.total_costs += abs(amount)

    def record_trade(self, trade: Trade) -> None:
        self.trades.append(trade)

    def record_rejection(self, ts: datetime, symbol: str, reason: str, detail: str = "") -> None:
        """Toda señal rechazada queda anotada.

        Sin esto no hay forma de distinguir "la estrategia no vio nada" de "la
        estrategia vio 400 setups y el motor los tiro todos". El sistema anterior
        murio exactamente por esa ceguera: un filtro rechazaba el 100% de las
        entradas y nadie se entero porque nadie contaba los rechazos.
        """
        self.rejections.append({"ts": ts, "symbol": symbol, "reason": reason, "detail": detail})
