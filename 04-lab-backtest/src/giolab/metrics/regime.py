"""Clasificacion por regimen de mercado.

El pedido de Cheyo es que el robot "funcione en cualquier escenario de mercado".
Eso no se mide con un numero global: se mide etiquetando cada dia por el regimen
que tuvo y reportando el rendimiento por separado en cada uno.

La conclusion que este modulo habilita:

  Una estrategia que gana en tendencia y pierde en rango NO es una estrategia
  mala. Es una estrategia a la que le falta un filtro de regimen. El reporte
  por regimen es lo que hace visible ese filtro. Sin el, la unica lectura
  posible es "da +0.05R, casi no sirve", y se tira a la basura una estrategia
  que con un filtro daria +0.4R en la mitad de los dias.

Tres etiquetas por dia de trading (rollover 17:00 NY) mas la sesion por trade.

Decision D-005: las etiquetas se calculan SOLO con datos anteriores al dia
etiquetado (shift de 1 dia). Como reporte post-hoc el lookahead seria tolerable,
pero si mañana alguna de estas etiquetas se usa como filtro en vivo, tiene que
haber sido calculable en vivo. Se paga el rigor ahora y no se debuggea despues.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from ..clock import ny_session_day
from ..indicators import adx, true_range
from ..resample import resample

# Umbrales. ADX>25 es el corte clasico de Wilder para "hay tendencia".
ADX_TREND = 25.0
ADX_RANGE = 20.0
VOL_LOW_PCT = 0.33
VOL_HIGH_PCT = 0.67
VOL_LOOKBACK_DAYS = 252  # un año de trading


@dataclass(slots=True)
class RegimeConfig:
    adx_period: int = 14
    adx_timeframe: str = "H4"
    atr_period: int = 14
    vol_lookback: int = VOL_LOOKBACK_DAYS
    news_csv: Path | None = None


def _atr_series(df_d1: pd.DataFrame, period: int) -> pd.Series:
    tr = true_range(
        df_d1["high"].to_numpy(dtype="float64"),
        df_d1["low"].to_numpy(dtype="float64"),
        df_d1["close"].to_numpy(dtype="float64"),
    )
    s = pd.Series(np.concatenate([[np.nan], tr]), index=df_d1.index)
    return s.rolling(period, min_periods=period).mean()


def _adx_by_day(df_h4: pd.DataFrame, period: int) -> pd.Series:
    """ADX al cierre de cada H4, agregado a mediana diaria."""
    high = df_h4["high"].to_numpy(dtype="float64")
    low = df_h4["low"].to_numpy(dtype="float64")
    close = df_h4["close"].to_numpy(dtype="float64")
    need = period * 3
    values = np.full(len(df_h4), np.nan)
    for i in range(need, len(df_h4)):
        values[i] = adx(high[: i + 1], low[: i + 1], close[: i + 1], period)
    s = pd.Series(values, index=df_h4.index)
    days = pd.Index([ny_session_day(ts.to_pydatetime()) for ts in df_h4.index])
    return s.groupby(days).median()


def load_news_days(path: Path | None) -> set[date]:
    """Dias con noticia de alto impacto ("roja").

    Formato esperado: CSV con una columna `date` (YYYY-MM-DD) y opcionalmente
    `impact`. Se toman las filas con impact en {high, red, 3} o todas si no hay
    columna impact.

    Si no hay archivo, los dias quedan etiquetados SIN_DATOS. Esto es una DECISION
    declarada (D-009), no un olvido: marcar como "limpio" un dia del que no se sabe
    nada es inventar un dato, y un regimen inventado contamina toda la conclusion.
    Que la etiqueta diga SIN_DATOS a la vista, en el reporte, deja claro de un
    vistazo que ese corte todavia no se puede leer.

    Hoy NO hay calendario historico. El del journal web no sirve para esto: solo
    tiene datos desde junio de 2026 y el backtest necesita tres años. Se resuelve
    aparte.
    """
    if path is None or not Path(path).exists():
        return set()
    df = pd.read_csv(path)
    cols = {c.lower(): c for c in df.columns}
    if "date" not in cols:
        raise ValueError(f"{path}: falta la columna 'date'")
    if "impact" in cols:
        mask = df[cols["impact"]].astype(str).str.lower().isin({"high", "red", "3", "alto"})
        df = df[mask]
    return {pd.Timestamp(d).date() for d in df[cols["date"]]}


def label_days(df_m1: pd.DataFrame, config: RegimeConfig | None = None) -> pd.DataFrame:
    """Etiqueta cada dia de trading. Indice: fecha del dia de sesion NY."""
    cfg = config or RegimeConfig()
    df_h4 = resample(df_m1, cfg.adx_timeframe)
    df_d1 = resample(df_m1, "D1")

    adx_day = _adx_by_day(df_h4, cfg.adx_period)
    d1_days = pd.Index([ny_session_day(ts.to_pydatetime()) for ts in df_d1.index], name="day")

    atr_s = _atr_series(df_d1, cfg.atr_period)
    atr_s.index = d1_days
    close = pd.Series(df_d1["close"].to_numpy(dtype="float64"), index=d1_days)
    sma50 = close.rolling(50, min_periods=50).mean()
    slope = (sma50 - sma50.shift(10)) / sma50.shift(10)

    out = pd.DataFrame(index=d1_days)
    # shift(1): la etiqueta de hoy se decide con lo que se sabia al cierre de ayer.
    out["adx"] = adx_day.reindex(d1_days).shift(1)
    out["atr"] = atr_s.shift(1)
    out["sma_slope"] = slope.shift(1)

    pct = out["atr"].rolling(cfg.vol_lookback, min_periods=60).rank(pct=True)
    out["atr_pct"] = pct

    out["tendencia"] = np.select(
        [out["adx"] >= ADX_TREND, out["adx"] <= ADX_RANGE],
        ["TENDENCIA", "RANGO"],
        default="TRANSICION",
    )
    out.loc[out["adx"].isna(), "tendencia"] = "SIN_DATOS"

    out["direccion"] = np.select(
        [out["sma_slope"] > 0.0005, out["sma_slope"] < -0.0005],
        ["ALCISTA", "BAJISTA"], default="LATERAL",
    )
    out.loc[out["sma_slope"].isna(), "direccion"] = "SIN_DATOS"

    out["volatilidad"] = np.select(
        [out["atr_pct"] >= VOL_HIGH_PCT, out["atr_pct"] <= VOL_LOW_PCT],
        ["ALTA", "BAJA"], default="NORMAL",
    )
    out.loc[out["atr_pct"].isna(), "volatilidad"] = "SIN_DATOS"

    news = load_news_days(cfg.news_csv)
    if news:
        out["noticia"] = np.where(pd.Index(out.index).isin(news), "ROJA", "LIMPIO")
    else:
        out["noticia"] = "SIN_DATOS"

    out.index.name = "day"
    return out


def attach_regimes(
    trades_df: pd.DataFrame, labels_by_symbol: dict[str, pd.DataFrame]
) -> pd.DataFrame:
    """Pega las etiquetas de regimen a cada trade, por su dia de ENTRADA."""
    if trades_df is None or len(trades_df) == 0:
        return trades_df
    df = trades_df.copy()
    days = [ny_session_day(pd.Timestamp(ts).to_pydatetime()) for ts in df["entry_ts"]]
    df["session_day"] = days

    for col in ("tendencia", "direccion", "volatilidad", "noticia"):
        values = []
        for sym, day in zip(df["symbol"], days):
            labels = labels_by_symbol.get(sym)
            if labels is None or day not in labels.index:
                values.append("SIN_DATOS")
            else:
                values.append(str(labels.at[day, col]))
        df[f"regime_{col}"] = values

    ts = pd.to_datetime(df["entry_ts"], utc=True)
    df["dia_semana"] = ts.dt.tz_convert("America/New_York").dt.day_name()
    df["hora_ny"] = ts.dt.tz_convert("America/New_York").dt.hour
    if "session" not in df or df["session"].eq("").all():
        from ..clock import session_of
        df["session"] = [session_of(pd.Timestamp(t).to_pydatetime()).value for t in df["entry_ts"]]
    return df
