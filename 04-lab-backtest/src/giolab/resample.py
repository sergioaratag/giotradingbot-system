"""Resampling M1 -> timeframes superiores.

Direccion unica: de M1 hacia arriba. Nunca al reves. Un M5 no se puede
"desarmar" en M1 sin inventar datos, y los datos inventados en un backtest
son exactamente como uno se miente a si mismo.

Alineacion de bordes (decision D-004, ver 06-Decisiones):
  - Intradia (M3..H4): alineado a medianoche UTC. H4 cierra 00/04/08/12/16/20 UTC.
  - D1: alineado al rollover de las 17:00 NY, que es el dia de trading real de FX
    y sigue el DST. Un D1 alineado a medianoche UTC parte la sesion de NY al medio.
"""

from __future__ import annotations

import pandas as pd

from .clock import UTC, ny_session_day

# Timeframes soportados -> minutos
TIMEFRAMES: dict[str, int] = {
    "M1": 1, "M3": 3, "M5": 5, "M15": 15, "M30": 30,
    "H1": 60, "H4": 240, "D1": 1440,
}

_OHLC_AGG: dict[str, str] = {
    "open": "first",
    "high": "max",
    "low": "min",
    "close": "last",
    "volume": "sum",
    "spread_mean": "mean",
    "spread_max": "max",
}


def _check_m1(df: pd.DataFrame) -> None:
    if not isinstance(df.index, pd.DatetimeIndex):
        raise TypeError("El indice debe ser DatetimeIndex")
    if df.index.tz is None:
        raise ValueError("El indice debe ser timezone-aware en UTC")
    missing = {"open", "high", "low", "close"} - set(df.columns)
    if missing:
        raise ValueError(f"Faltan columnas OHLC: {sorted(missing)}")
    if not df.index.is_monotonic_increasing:
        raise ValueError("El indice M1 no esta ordenado")


def resample(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    """Agrega velas M1 al timeframe pedido.

    El indice resultante es el timestamp de APERTURA de cada vela, en UTC.
    Las velas sin ningun M1 adentro (fin de semana, feriados) se eliminan:
    una vela vacia no existio, no es un cero.
    """
    _check_m1(df)
    tf = timeframe.upper()
    if tf not in TIMEFRAMES:
        raise ValueError(f"Timeframe desconocido: {timeframe}. Validos: {sorted(TIMEFRAMES)}")
    if tf == "M1":
        return df.copy()

    agg = {k: v for k, v in _OHLC_AGG.items() if k in df.columns}

    if tf == "D1":
        return _resample_d1(df, agg)

    minutes = TIMEFRAMES[tf]
    out = df.resample(f"{minutes}min", label="left", closed="left", origin="epoch").agg(agg)
    return out.dropna(subset=["open"])


def _resample_d1(df: pd.DataFrame, agg: dict[str, str]) -> pd.DataFrame:
    """D1 por dia de trading NY (rollover 17:00, con DST real)."""
    day = pd.Index([ny_session_day(ts.to_pydatetime()) for ts in df.index], name="session_day")
    grouped = df.groupby(day).agg(agg)
    # El timestamp de la vela D1 es el instante de apertura real (primer M1 del dia).
    first_ts = df.groupby(day).apply(lambda g: g.index[0], include_groups=False)
    out = grouped.copy()
    out.index = pd.DatetimeIndex(first_ts.values, tz=UTC, name="ts")
    return out.dropna(subset=["open"])


def build_multi_timeframe(df_m1: pd.DataFrame, timeframes: list[str]) -> dict[str, pd.DataFrame]:
    """Construye todos los timeframes que una estrategia declara necesitar."""
    return {tf.upper(): resample(df_m1, tf) for tf in dict.fromkeys(tf.upper() for tf in timeframes)}
