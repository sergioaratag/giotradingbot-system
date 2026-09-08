"""Modelo de costos. Es la diferencia entre un backtest y un cuento.

Cuatro costos, todos reales, ninguno opcional:
  - spread: se paga siempre, y en FX cambia mucho por sesion. Un spread fijo de
    1 pip aplicado a las 03:00 NY es ficcion pura.
  - comision: por lote, round-turn.
  - slippage: siempre en contra. Nunca a favor. En vivo el slippage favorable
    existe, pero contarlo en un backtest es optimismo disfrazado de rigor.
  - swap: si la posicion cruza el rollover de las 17:00 NY. Triple los miercoles.

Cuando los datos traen spread real (Dukascopy tick trae bid y ask), se usa ese.
El perfil por sesion es el respaldo para cuando no hay dato.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..clock import Session, session_of, swap_multiplier
from ..types import Instrument, Side

# Spread tipico por sesion, en pips. Respaldo para datos sin spread real.
# Valores conservadores de bróker retail para majors.
DEFAULT_SPREAD_BY_SESSION: dict[Session, float] = {
    Session.LONDON: 0.9,
    Session.OVERLAP: 0.7,
    Session.NEW_YORK: 1.0,
    Session.ASIA: 1.6,
    Session.OFF: 3.0,   # apertura del domingo y bordes: el spread se abre feo
}


@dataclass(slots=True)
class CostConfig:
    """Parametros de costo. Los defaults son de bróker retail tipo Pepperstone raw."""

    use_real_spread: bool = True          # usar el spread de los datos si existe
    spread_by_session: dict[Session, float] = field(
        default_factory=lambda: dict(DEFAULT_SPREAD_BY_SESSION)
    )
    spread_multiplier: float = 1.0        # para escenarios de estres (2.0 = todo el doble)
    commission_per_lot_round_turn: float = 7.0   # USD por lote, ida y vuelta
    slippage_pips: float = 0.2            # siempre adverso
    slippage_pips_stop: float = 0.5       # los stops resbalan mas que las entradas
    swap_long_pips_per_day: float = -0.35
    swap_short_pips_per_day: float = 0.10
    apply_swap: bool = True

    def spread_pips(self, ts: datetime, bar_spread_points: float, instrument: Instrument) -> float:
        """Spread a aplicar en un instante, en pips."""
        if self.use_real_spread and bar_spread_points > 0:
            pips = bar_spread_points * instrument.point_size / instrument.pip_size
        else:
            pips = self.spread_by_session.get(session_of(ts), 2.0)
        return pips * self.spread_multiplier

    def entry_price(
        self, side: Side, mid_price: float, ts: datetime,
        bar_spread_points: float, instrument: Instrument,
    ) -> float:
        """Precio de entrada efectivo: medio spread en contra + slippage en contra.

        Los datos se guardan en bid. Una compra se ejecuta en ask = bid + spread.
        Se modela como medio spread a cada lado del medio para que compra y venta
        paguen lo mismo y la comparacion entre direcciones sea limpia.
        """
        half = self.spread_pips(ts, bar_spread_points, instrument) / 2.0
        adverse = (half + self.slippage_pips) * instrument.pip_size
        return mid_price + adverse * side.sign

    def exit_price(
        self, side: Side, mid_price: float, ts: datetime,
        bar_spread_points: float, instrument: Instrument, is_stop: bool = False,
    ) -> float:
        """Precio de salida efectivo. Cerrar tambien paga spread y slippage."""
        half = self.spread_pips(ts, bar_spread_points, instrument) / 2.0
        slip = self.slippage_pips_stop if is_stop else self.slippage_pips
        adverse = (half + slip) * instrument.pip_size
        return mid_price - adverse * side.sign

    def commission(self, lots: float) -> float:
        return lots * self.commission_per_lot_round_turn

    def swap(self, side: Side, lots: float, ts: datetime, instrument: Instrument) -> float:
        """Swap al cruzar el rollover. Devuelve USD (negativo = costo)."""
        if not self.apply_swap:
            return 0.0
        pips = (
            self.swap_long_pips_per_day if side is Side.BUY else self.swap_short_pips_per_day
        )
        pips *= swap_multiplier(ts)
        return pips * instrument.pip_size * lots * instrument.contract_size
