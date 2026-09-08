"""Almacenamiento en Parquet.

Por que Parquet y no CSV: pesa entre 5 y 10 veces menos, carga entre 10 y 50
veces mas rapido y guarda los tipos (incluida la zona horaria del indice). Un CSV
de M1 de tres años son cientos de megas de texto que hay que reparsear cada vez,
y ademas el timestamp vuelve como string: es exactamente el camino por el que se
pierde la zona horaria y aparece el bug de las sesiones corridas.

Contrato del formato guardado, sin excepciones:
  - indice `ts`, DatetimeIndex, timezone-aware, UTC, ordenado, sin duplicados
  - columnas: open, high, low, close, volume, spread_mean, spread_max, [ticks]
  - OHLC sobre el BID; el spread va aparte, en puntos
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

REQUIRED = ("open", "high", "low", "close")
OPTIONAL = ("volume", "spread_mean", "spread_max", "ticks")


def m1_path(root: Path, symbol: str) -> Path:
    return Path(root) / f"{symbol}_M1.parquet"


def validate(df: pd.DataFrame) -> None:
    if not isinstance(df.index, pd.DatetimeIndex):
        raise TypeError("El indice debe ser DatetimeIndex")
    if df.index.tz is None:
        raise ValueError("El indice debe ser timezone-aware")
    if str(df.index.tz) not in ("UTC", "utc"):
        raise ValueError(f"El indice debe estar en UTC, no en {df.index.tz}")
    missing = set(REQUIRED) - set(df.columns)
    if missing:
        raise ValueError(f"Faltan columnas: {sorted(missing)}")
    if not df.index.is_monotonic_increasing:
        raise ValueError("El indice no esta ordenado")
    if df.index.has_duplicates:
        raise ValueError(f"Hay {int(df.index.duplicated().sum())} timestamps duplicados")
    bad = df[(df["high"] < df["low"]) | (df["high"] < df["open"]) |
             (df["high"] < df["close"]) | (df["low"] > df["open"]) |
             (df["low"] > df["close"])]
    if len(bad):
        raise ValueError(f"{len(bad)} velas con OHLC incoherente (ej: {bad.index[0]})")


def save_m1(df: pd.DataFrame, root: Path, symbol: str) -> Path:
    validate(df)
    path = m1_path(root, symbol)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, engine="pyarrow", compression="zstd", index=True)
    return path


def load_m1(
    root: Path, symbol: str, start: str | None = None, end: str | None = None
) -> pd.DataFrame:
    path = m1_path(root, symbol)
    if not path.exists():
        raise FileNotFoundError(
            f"No hay datos M1 de {symbol} en {path}.\n"
            f"Corre:  python scripts/download_data.py --symbol {symbol} --years 3"
        )
    df = pd.read_parquet(path, engine="pyarrow")
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    if start:
        df = df[df.index >= pd.Timestamp(start, tz="UTC")]
    if end:
        df = df[df.index <= pd.Timestamp(end, tz="UTC")]
    validate(df)
    return df


def merge_m1(existing: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    """Une datos nuevos con los que ya estaban. Gana lo nuevo ante conflicto."""
    if existing is None or len(existing) == 0:
        return new.sort_index()
    combined = pd.concat([existing, new])
    combined = combined[~combined.index.duplicated(keep="last")]
    return combined.sort_index()


def available(root: Path) -> dict[str, dict]:
    """Que hay guardado y de que periodo."""
    out: dict[str, dict] = {}
    for path in sorted(Path(root).glob("*_M1.parquet")):
        symbol = path.stem.replace("_M1", "")
        df = pd.read_parquet(path, engine="pyarrow", columns=["close"])
        out[symbol] = {
            "path": str(path),
            "bars": len(df),
            "start": df.index[0] if len(df) else None,
            "end": df.index[-1] if len(df) else None,
            "size_mb": round(path.stat().st_size / 1024 / 1024, 2),
        }
    return out
