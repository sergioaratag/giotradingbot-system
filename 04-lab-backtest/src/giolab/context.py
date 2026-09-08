"""MarketContext: lo unico que la estrategia puede ver.

Esta es la pieza que hace que el laboratorio sirva para algo. El pecado capital
del backtesting es el lookahead: dejar que la estrategia vea, aunque sea de
refilon, un dato que en vivo todavia no existia. Cuando eso pasa, el backtest da
resultados hermosos y la cuenta real pierde plata. No hay forma de detectarlo
mirando la curva de equity: hay que hacerlo estructuralmente imposible.

Aca se hace imposible de tres formas:

  1. La estrategia NUNCA recibe el DataFrame completo. Recibe `Frame`, que es una
     vista recortada al numero de velas efectivamente cerradas.
  2. El recorte usa la hora de CIERRE de cada vela, no la de apertura. Si son las
     09:00 UTC, la vela H4 de las 08:00 todavia no cerro y por lo tanto no existe.
     Este es el lookahead sutil que se cuela en el 90% de los backtests multi-TF.
  3. Los caminos de escape (llegar al array crudo, pedir un offset futuro) levantan
     LookaheadError en vez de devolver un numero.

Y ademas hay un test de equivalencia por truncado (tests/test_no_lookahead.py) que
lo verifica de punta a punta sobre el motor completo.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

import numpy as np
import pandas as pd

from .clock import Session, session_of
from .types import Bar, Instrument, Position

if TYPE_CHECKING:  # pragma: no cover
    from .engine.account import Account


class LookaheadError(RuntimeError):
    """Se intento leer un dato que en ese instante todavia no existia."""


_COLS = ("open", "high", "low", "close", "volume", "spread_mean", "spread_max")


class TimeframeData:
    """Datos completos de un timeframe. Vive en el motor, no en la estrategia."""

    __slots__ = ("timeframe", "ts_open", "ts_close", "cols", "n_total")

    def __init__(self, timeframe: str, df: pd.DataFrame, close_ts: np.ndarray) -> None:
        self.timeframe = timeframe
        self.ts_open: np.ndarray = df.index.values.astype("datetime64[ns]")
        self.ts_close: np.ndarray = close_ts.astype("datetime64[ns]")
        self.cols: dict[str, np.ndarray] = {
            c: np.ascontiguousarray(df[c].to_numpy(dtype="float64"))
            for c in _COLS
            if c in df.columns
        }
        self.n_total = len(df)

    def n_closed_at(self, now: np.datetime64) -> int:
        """Cuantas velas de este TF ya cerraron en el instante `now` (inclusive)."""
        return int(np.searchsorted(self.ts_close, now, side="right"))


class Frame:
    """Vista de solo lectura de un timeframe, recortada a lo ya cerrado.

    Semantica de indices: `[-1]` es la ultima vela CERRADA (la actual desde el punto
    de vista de la estrategia), `[-2]` la anterior. Igual que una lista de Python.
    """

    __slots__ = ("_data", "_n", "_cache")

    def __init__(self, data: TimeframeData, n: int) -> None:
        self._data = data
        self._n = n
        self._cache: dict[str, np.ndarray] = {}

    def __len__(self) -> int:
        return self._n

    def __bool__(self) -> bool:
        return self._n > 0

    @property
    def timeframe(self) -> str:
        return self._data.timeframe

    def _col(self, name: str) -> np.ndarray:
        arr = self._cache.get(name)
        if arr is None:
            src = self._data.cols.get(name)
            if src is None:
                raise KeyError(f"El timeframe {self.timeframe} no tiene la columna {name!r}")
            arr = src[: self._n]
            arr.flags.writeable = False  # nadie muta los datos historicos
            self._cache[name] = arr
        return arr

    # --- series visibles -------------------------------------------------
    @property
    def open(self) -> np.ndarray: return self._col("open")
    @property
    def high(self) -> np.ndarray: return self._col("high")
    @property
    def low(self) -> np.ndarray: return self._col("low")
    @property
    def close(self) -> np.ndarray: return self._col("close")
    @property
    def volume(self) -> np.ndarray: return self._col("volume")

    @property
    def ts(self) -> np.ndarray:
        arr = self._cache.get("__ts")
        if arr is None:
            arr = self._data.ts_open[: self._n]
            arr.flags.writeable = False
            self._cache["__ts"] = arr
        return arr

    # --- acceso puntual --------------------------------------------------
    def at(self, offset: int) -> Bar:
        """Vela por offset. 0 = la ultima cerrada, 1 = la anterior, 2 = dos atras.

        Un offset negativo pide el futuro y es un error, no un dato.
        """
        if offset < 0:
            raise LookaheadError(
                f"Frame.at({offset}) sobre {self.timeframe}: los offsets negativos apuntan "
                "al futuro. La estrategia solo puede ver hasta la vela actual."
            )
        if offset >= self._n:
            raise IndexError(
                f"Frame.at({offset}) sobre {self.timeframe}: solo hay {self._n} velas cerradas."
            )
        i = self._n - 1 - offset
        d = self._data.cols
        ts = pd.Timestamp(self._data.ts_open[i]).tz_localize("UTC").to_pydatetime()
        return Bar(
            ts=ts,
            open=float(d["open"][i]),
            high=float(d["high"][i]),
            low=float(d["low"][i]),
            close=float(d["close"][i]),
            volume=float(d["volume"][i]) if "volume" in d else 0.0,
            spread_mean=float(d["spread_mean"][i]) if "spread_mean" in d else 0.0,
            spread_max=float(d["spread_max"][i]) if "spread_max" in d else 0.0,
        )

    @property
    def current(self) -> Bar:
        return self.at(0)

    def last(self, n: int, col: str = "close") -> np.ndarray:
        """Las ultimas n barras de una columna. Devuelve menos si no hay tantas."""
        if n <= 0:
            raise ValueError("n debe ser positivo")
        return self._col(col)[-n:]

    # --- caminos de escape, cerrados -------------------------------------
    def __getattr__(self, name: str) -> Any:
        raise LookaheadError(
            f"Frame no expone {name!r}. Si estas buscando los datos crudos o el futuro, "
            "eso es exactamente lo que este objeto existe para impedir."
        )


class MarketContext:
    """Todo lo que la estrategia sabe en el cierre de una vela del TF base."""

    __slots__ = ("symbol", "instrument", "now", "_now64", "_tfs", "_frames",
                 "account", "positions", "base_timeframe")

    def __init__(
        self,
        symbol: str,
        instrument: Instrument,
        now: datetime,
        now64: np.datetime64,
        tfs: dict[str, TimeframeData],
        base_timeframe: str,
        account: "Account",
        positions: list[Position],
    ) -> None:
        self.symbol = symbol
        self.instrument = instrument
        self.now = now              # cierre de la vela base actual, UTC
        self._now64 = now64
        self._tfs = tfs
        self._frames: dict[str, Frame] = {}
        self.base_timeframe = base_timeframe
        self.account = account
        self.positions = positions

    def tf(self, timeframe: str) -> Frame:
        """Vista del timeframe pedido, recortada a lo cerrado en `self.now`."""
        key = timeframe.upper()
        frame = self._frames.get(key)
        if frame is None:
            data = self._tfs.get(key)
            if data is None:
                raise KeyError(
                    f"El timeframe {key} no fue cargado. Declaralo en "
                    f"Strategy.required_timeframes para que el motor lo prepare."
                )
            frame = Frame(data, data.n_closed_at(self._now64))
            self._frames[key] = frame
        return frame

    @property
    def base(self) -> Frame:
        return self.tf(self.base_timeframe)

    @property
    def bar(self) -> Bar:
        """La vela base que se acaba de cerrar."""
        return self.base.current

    @property
    def price(self) -> float:
        """Ultimo precio conocido: el cierre de la vela base actual."""
        return self.bar.close

    @property
    def session(self) -> Session:
        return session_of(self.now)

    @property
    def equity(self) -> float:
        return self.account.equity

    @property
    def balance(self) -> float:
        return self.account.balance

    def position_for(self, symbol: str | None = None) -> Position | None:
        sym = symbol or self.symbol
        for p in self.positions:
            if p.symbol == sym:
                return p
        return None
