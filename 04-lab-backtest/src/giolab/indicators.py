"""Indicadores. Funciones puras sobre arrays: entra un array, sale un numero.

Reciben SIEMPRE la ventana ya recortada por el Frame. No conocen el DataFrame
completo y por lo tanto no pueden filtrar futuro aunque se los pida.
"""

from __future__ import annotations

import numpy as np


def sma(values: np.ndarray, period: int) -> float:
    if len(values) < period:
        return float("nan")
    return float(values[-period:].mean())


def ema(values: np.ndarray, period: int) -> float:
    """EMA sobre la ventana disponible. Necesita ~3x el periodo para estabilizar."""
    if len(values) < period:
        return float("nan")
    window = values[-min(len(values), period * 4):]
    alpha = 2.0 / (period + 1.0)
    out = window[0]
    for v in window[1:]:
        out = alpha * v + (1 - alpha) * out
    return float(out)


def true_range(high: np.ndarray, low: np.ndarray, close: np.ndarray) -> np.ndarray:
    if len(high) < 2:
        return np.array([], dtype="float64")
    prev_close = close[:-1]
    h, l = high[1:], low[1:]
    return np.maximum(h - l, np.maximum(np.abs(h - prev_close), np.abs(l - prev_close)))


def atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> float:
    tr = true_range(high, low, close)
    if len(tr) < period:
        return float("nan")
    return float(tr[-period:].mean())


def adx(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> float:
    """ADX de Wilder, suavizado simple. Mide fuerza de tendencia, no direccion."""
    n = period * 2 + 1
    if len(high) < n:
        return float("nan")
    h, l, c = high[-(n + period):], low[-(n + period):], close[-(n + period):]
    up = h[1:] - h[:-1]
    down = l[:-1] - l[1:]
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    tr = true_range(h, l, c)
    if len(tr) < period:
        return float("nan")

    def wilder(arr: np.ndarray) -> np.ndarray:
        out = np.empty(len(arr) - period + 1, dtype="float64")
        out[0] = arr[:period].sum()
        for i in range(1, len(out)):
            out[i] = out[i - 1] - out[i - 1] / period + arr[period + i - 1]
        return out

    atr_s, pdm_s, mdm_s = wilder(tr), wilder(plus_dm), wilder(minus_dm)
    with np.errstate(divide="ignore", invalid="ignore"):
        pdi = 100.0 * pdm_s / atr_s
        mdi = 100.0 * mdm_s / atr_s
        dx = 100.0 * np.abs(pdi - mdi) / (pdi + mdi)
    dx = dx[np.isfinite(dx)]
    if len(dx) < period:
        return float(dx.mean()) if len(dx) else float("nan")
    return float(dx[-period:].mean())


def rolling_percentile(values: np.ndarray, value: float) -> float:
    """En que percentil de su propia historia cae `value`. 0..1."""
    if len(values) == 0:
        return float("nan")
    return float((values < value).sum() / len(values))
