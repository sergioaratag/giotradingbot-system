"""Informe de calidad de datos.

Un backtest no vale mas que los datos sobre los que corrio. Este modulo responde
las tres preguntas que hay que contestar ANTES de creerle a cualquier resultado:

  1. Cuantas velas faltan y donde estan los huecos.
  2. Hay spread real en los datos o hay que estimarlo.
  3. En que zona horaria vienen los timestamps.

Un hueco de fin de semana es normal. Un hueco de tres horas un martes a las 10 de
la mañana no lo es, y si cae justo donde la estrategia opera, invalida el tramo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

import numpy as np
import pandas as pd

from ..clock import to_ny


@dataclass(slots=True)
class Gap:
    start: pd.Timestamp
    end: pd.Timestamp
    minutes: int
    is_weekend: bool
    ny_start: str

    def as_row(self) -> dict:
        return {
            "desde_utc": self.start, "hasta_utc": self.end,
            "minutos": self.minutes, "horas": round(self.minutes / 60, 1),
            "fin_de_semana": self.is_weekend, "inicio_NY": self.ny_start,
        }


@dataclass(slots=True)
class QualityReport:
    symbol: str
    n_bars: int = 0
    start: pd.Timestamp | None = None
    end: pd.Timestamp | None = None
    expected_bars: int = 0
    coverage_pct: float = 0.0
    gaps: list[Gap] = field(default_factory=list)
    weekday_gaps: list[Gap] = field(default_factory=list)
    has_real_spread: bool = False
    spread_stats: dict = field(default_factory=dict)
    timezone: str = ""
    flat_bars: int = 0
    zero_volume_bars: int = 0
    duplicated: int = 0
    warnings: list[str] = field(default_factory=list)

    def summary(self) -> str:
        lines = [
            f"# Calidad de datos — {self.symbol}",
            "",
            f"- Periodo: **{self.start} → {self.end}** (UTC)",
            f"- Velas M1: **{self.n_bars:,}** de ~{self.expected_bars:,} esperadas "
            f"(**{self.coverage_pct:.2f}%** de cobertura)",
            f"- Zona horaria del indice: **{self.timezone}**",
            f"- Spread real en los datos: **{'SI' if self.has_real_spread else 'NO'}**",
        ]
        if self.spread_stats:
            s = self.spread_stats
            lines.append(
                f"  - spread medio **{s['mean_pips']:.2f} pips**, mediana "
                f"{s['median_pips']:.2f}, p95 {s['p95_pips']:.2f}, "
                f"maximo {s['max_pips']:.2f}"
            )
            if "by_session" in s:
                lines.append("  - por sesion (pips): " + ", ".join(
                    f"{k} {v:.2f}" for k, v in s["by_session"].items()))
        lines += [
            f"- Huecos totales: **{len(self.gaps)}** — de los cuales "
            f"**{len(self.weekday_gaps)}** caen en dia habil",
            f"- Velas planas (OHLC identico): {self.flat_bars:,}",
            f"- Velas con volumen cero: {self.zero_volume_bars:,}",
            f"- Timestamps duplicados: {self.duplicated}",
        ]
        if self.weekday_gaps:
            lines += ["", "## Huecos en dia habil (los que importan)", "",
                      "| Desde (UTC) | Hasta (UTC) | Horas | Inicio NY |",
                      "|---|---|---|---|"]
            for g in sorted(self.weekday_gaps, key=lambda x: -x.minutes)[:25]:
                lines.append(
                    f"| {g.start} | {g.end} | {g.minutes/60:.1f} | {g.ny_start} |"
                )
            if len(self.weekday_gaps) > 25:
                lines.append(f"| ... | | | {len(self.weekday_gaps)-25} huecos mas |")
        if self.warnings:
            lines += ["", "## Advertencias", ""] + [f"- {w}" for w in self.warnings]
        return "\n".join(lines)


def _expected_m1_bars(start: pd.Timestamp, end: pd.Timestamp) -> int:
    """Minutos de mercado abierto entre dos instantes.

    El mercado FX corre de domingo 21:00 UTC a viernes 21:00 UTC (aproximado:
    se ignora el DST para esta estimacion, que es solo una referencia de cobertura).
    """
    total = 0
    day = start.normalize()
    while day <= end:
        wd = day.weekday()
        if wd < 4:            # lunes a jueves: dia completo
            minutes = 1440
        elif wd == 4:         # viernes: hasta las 21:00 UTC
            minutes = 21 * 60
        elif wd == 6:         # domingo: desde las 21:00 UTC
            minutes = 3 * 60
        else:                 # sabado
            minutes = 0
        total += minutes
        day += timedelta(days=1)
    return total


def analyze(df: pd.DataFrame, symbol: str, pip_size: float = 0.0001,
            point_size: float = 0.00001, min_gap_minutes: int = 5) -> QualityReport:
    rep = QualityReport(symbol=symbol)
    if len(df) == 0:
        rep.warnings.append("No hay datos.")
        return rep

    rep.n_bars = len(df)
    rep.start, rep.end = df.index[0], df.index[-1]
    rep.timezone = str(df.index.tz)
    rep.duplicated = int(df.index.duplicated().sum())
    rep.expected_bars = _expected_m1_bars(rep.start, rep.end)
    rep.coverage_pct = 100.0 * rep.n_bars / rep.expected_bars if rep.expected_bars else 0.0

    # huecos
    deltas = df.index.to_series().diff().dt.total_seconds().div(60)
    idx = np.where(deltas.to_numpy() > min_gap_minutes)[0]
    for i in idx:
        start_ts, end_ts = df.index[i - 1], df.index[i]
        minutes = int((end_ts - start_ts).total_seconds() // 60)
        ny = to_ny(start_ts.to_pydatetime())
        # Un hueco es "de fin de semana" si arranca viernes >=20 UTC y termina domingo/lunes.
        weekend = (start_ts.weekday() == 4 and start_ts.hour >= 20) or start_ts.weekday() == 5
        gap = Gap(start_ts, end_ts, minutes, weekend, ny.strftime("%a %H:%M %Z"))
        rep.gaps.append(gap)
        if not weekend and minutes >= 30:
            rep.weekday_gaps.append(gap)

    # spread
    if "spread_mean" in df.columns and df["spread_mean"].notna().any():
        sp = df["spread_mean"].dropna()
        if (sp > 0).any():
            rep.has_real_spread = True
            factor = point_size / pip_size
            rep.spread_stats = {
                "mean_pips": float(sp.mean() * factor),
                "median_pips": float(sp.median() * factor),
                "p95_pips": float(sp.quantile(0.95) * factor),
                "max_pips": float(df["spread_max"].max() * factor)
                if "spread_max" in df else float(sp.max() * factor),
            }
            from ..clock import session_of
            sessions = pd.Index([session_of(ts.to_pydatetime()).value for ts in sp.index])
            rep.spread_stats["by_session"] = {
                k: float(v * factor)
                for k, v in sp.groupby(sessions).median().sort_values().items()
            }
    if not rep.has_real_spread:
        rep.warnings.append(
            "No hay spread real en los datos: el motor va a usar el perfil estimado "
            "por sesion de CostConfig. Los costos son una aproximacion, no una medicion."
        )

    rep.flat_bars = int(((df["high"] == df["low"]) & (df["open"] == df["close"])).sum())
    if "volume" in df.columns:
        rep.zero_volume_bars = int((df["volume"] == 0).sum())

    if rep.coverage_pct < 90:
        rep.warnings.append(
            f"Cobertura del {rep.coverage_pct:.1f}%: faltan mas de una de cada diez velas. "
            "Revisar los huecos de dia habil antes de creerle a cualquier backtest."
        )
    if rep.flat_bars > rep.n_bars * 0.05:
        rep.warnings.append(
            f"{rep.flat_bars:,} velas planas ({100*rep.flat_bars/rep.n_bars:.1f}%): "
            "puede ser liquidez baja real o relleno artificial del proveedor."
        )
    if rep.duplicated:
        rep.warnings.append(f"{rep.duplicated} timestamps duplicados.")
    return rep
