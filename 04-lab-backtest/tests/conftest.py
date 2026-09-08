"""Fixtures compartidas. Datos sinteticos deterministas: mismos numeros siempre."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


def make_m1(
    n: int = 60 * 24 * 40, start: str = "2025-01-06 00:00", seed: int = 42,
    trend: float = 0.0, spread_points: float = 12.0, mean_revert: bool = False,
) -> pd.DataFrame:
    """Serie M1 sintetica reproducible. NO son datos de mercado.

    `mean_revert=True` genera una serie que oscila alrededor de 1.10 (proceso de
    reversion a la media). Sirve para los tests que necesitan MUCHOS trades: una
    caminata aleatoria pura casi no cruza sus propias medias, y un test con dos
    trades no prueba nada.
    """
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start, periods=n, freq="1min", tz="UTC")
    if mean_revert:
        close = np.empty(n, dtype="float64")
        level, theta, sigma = 1.10, 0.004, 0.00012
        x = level
        shocks = rng.normal(0, sigma, n)
        for i in range(n):
            x += theta * (level - x) + shocks[i]
            close[i] = x
    else:
        steps = rng.normal(trend, 0.00007, n) + np.sin(np.arange(n) / 7000) * 0.00003
        close = 1.10 + np.cumsum(steps)
    wick = np.abs(rng.normal(0, 0.00009, n))
    open_ = np.concatenate([[close[0]], close[:-1]])
    return pd.DataFrame({
        "open": open_,
        "high": np.maximum(open_, close) + wick,
        "low": np.minimum(open_, close) - wick,
        "close": close,
        "volume": rng.uniform(1, 50, n),
        "spread_mean": spread_points,
        "spread_max": spread_points * 2,
    }, index=idx)


@pytest.fixture(scope="session")
def m1() -> pd.DataFrame:
    return make_m1()


@pytest.fixture(scope="session")
def m1_short() -> pd.DataFrame:
    return make_m1(n=60 * 24 * 12, seed=11)
