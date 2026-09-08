"""ESTRATEGIA DE PRUEBA - NO OPERAR. NI EN DEMO.

===========================================================================
  ESTO NO ES UNA ESTRATEGIA. Es un caso de prueba para verificar que el motor
  funciona de punta a punta: que genera señales, que dimensiona, que ejecuta,
  que aplica costos, que cierra y que las metricas salen.

  Un cruce de medias sobre EURUSD no tiene edge. Nunca lo tuvo. Si el reporte
  de esta estrategia da positivo en algun periodo, eso NO significa nada mas
  que "ese periodo tuvo tendencia". No la lleves a demo, no la lleves a real,
  no la uses de linea de base para decidir nada.

  Su unico trabajo es que si el motor se rompe, se note.
===========================================================================
"""

from __future__ import annotations

from ..context import MarketContext
from ..indicators import atr, sma
from ..strategy import BaseStrategy
from ..types import Action, ActionKind, Position, Side, Signal, TakeProfit


class DemoMACross(BaseStrategy):
    """SOLO PRUEBA. Cruce SMA rapida/lenta en M15, stop por ATR, objetivo 2R."""

    name = "DEMO_ma_cross_NO_OPERAR"
    required_timeframes = ["M15", "H1"]

    def __init__(
        self, fast: int = 20, slow: int = 50, atr_period: int = 14,
        atr_mult: float = 1.5, rr: float = 2.0, trail_at_r: float = 1.0,
    ) -> None:
        self.fast = fast
        self.slow = slow
        self.atr_period = atr_period
        self.atr_mult = atr_mult
        self.rr = rr
        self.trail_at_r = trail_at_r
        self._prev_diff: float | None = None

    def on_start(self, symbol: str) -> None:
        self._prev_diff = None

    def on_bar(self, ctx: MarketContext) -> Signal | None:
        m15 = ctx.tf("M15")
        if len(m15) < self.slow + 2:
            return None

        close = m15.close
        fast_v = sma(close, self.fast)
        slow_v = sma(close, self.slow)
        diff = fast_v - slow_v
        prev = self._prev_diff
        self._prev_diff = diff

        if prev is None or ctx.position_for() is not None:
            return None

        crossed_up = prev <= 0 < diff
        crossed_down = prev >= 0 > diff
        if not (crossed_up or crossed_down):
            return None

        a = atr(m15.high, m15.low, close, self.atr_period)
        if not (a > 0):
            return None

        price = float(close[-1])
        distance = a * self.atr_mult
        side = Side.BUY if crossed_up else Side.SELL
        stop = price - distance * side.sign
        target = price + distance * self.rr * side.sign
        ny = ctx.now.astimezone(__import__("giolab.clock", fromlist=["NY"]).NY)

        return Signal(
            side=side, entry=price, stop_loss=stop,
            take_profits=(TakeProfit(target, 1.0),),
            reason=(
                f"[PRUEBA] cruce SMA{self.fast}/{self.slow} "
                f"{'alcista' if crossed_up else 'bajista'} en M15, "
                f"stop {ctx.instrument.pips(distance):.1f} pips "
                f"({self.atr_mult}xATR), objetivo {self.rr}R, "
                f"{ny.strftime('%H:%M NY')} {ctx.session.value}"
            ),
            tags={"atr_pips": round(ctx.instrument.pips(a), 1)},
        )

    def manage(self, ctx: MarketContext, pos: Position) -> Action | None:
        """Trailing simple: al llegar a 1R, el stop va a break-even."""
        if pos.tags.get("moved_to_be"):
            return None
        r = pos.r_multiple_at(ctx.price, ctx.instrument.contract_size)
        if r < self.trail_at_r:
            return None
        pos.tags["moved_to_be"] = True
        return Action(
            kind=ActionKind.MOVE_STOP, new_stop=pos.entry_price,
            reason=f"[PRUEBA] {r:.2f}R alcanzado, stop a break-even",
        )
