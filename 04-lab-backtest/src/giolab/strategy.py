"""El contrato de estrategia.

Esta interfaz es lo que permite meter la estrategia 1, despues la 2, despues la 3,
y compararlas con exactamente la misma vara: mismos datos, mismos costos, mismas
reglas de riesgo, mismas metricas. Si cada estrategia trajera su propio motor,
comparar sus resultados no significaria nada.

Una estrategia NO decide cuantos lotes opera. Declara donde entra, donde esta
equivocada (el stop) y cuanto riesgo sugiere en porcentaje. El motor traduce eso
a lotes. Separar las dos cosas es lo que hace que el riesgo sea auditable y que
cambiar de tamano de cuenta no cambie los resultados en R.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .context import MarketContext
from .types import Action, Position, Signal


@runtime_checkable
class Strategy(Protocol):
    """Contrato minimo. Implementalo como clase normal, no hace falta heredar."""

    name: str
    required_timeframes: list[str]

    def on_bar(self, ctx: MarketContext) -> Signal | None:
        """Se llama al CIERRE de cada vela del timeframe base.

        `ctx` solo expone datos hasta ese cierre, nunca un tick mas.

        Devolver un Signal es una intencion, no una orden ejecutada: el motor
        todavia puede rechazarla por riesgo, por limites de prop firm o porque
        ya hay una posicion abierta. La ejecucion, si ocurre, es en la apertura
        de la vela SIGUIENTE, que es lo unico honesto: en vivo no se puede
        operar al precio de cierre de una vela que recien termina de cerrar.
        """
        ...

    def manage(self, ctx: MarketContext, pos: Position) -> Action | None:
        """Gestion de una posicion abierta: trailing, salida anticipada, parciales.

        Se llama una vez por vela base y por posicion, ANTES de on_bar.
        Devolver None es "no hacer nada".
        """
        ...


class BaseStrategy:
    """Base opcional con los defaults sanos. Ahorra escribir `manage` vacio."""

    name: str = "unnamed"
    required_timeframes: list[str] = ["M5"]

    @property
    def base_timeframe(self) -> str:
        """El TF base es el primero de la lista: el que marca el ritmo del motor."""
        return self.required_timeframes[0]

    def on_start(self, symbol: str) -> None:
        """Hook opcional: se llama una vez antes de la primera vela."""

    def on_bar(self, ctx: MarketContext) -> Signal | None:
        raise NotImplementedError

    def manage(self, ctx: MarketContext, pos: Position) -> Action | None:
        return None
