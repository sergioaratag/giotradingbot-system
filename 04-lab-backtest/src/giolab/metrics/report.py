"""Generacion del reporte. Global + por regimen.

El reporte esta diseñado para contestar UNA pregunta: en que escenario de mercado
esta estrategia gana y en cual pierde. El numero global casi nunca alcanza para
decidir nada; el desglose por regimen si.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from ..engine.engine import BacktestResult
from . import stats as st
from .regime import attach_regimes, label_days


@dataclass(slots=True)
class Report:
    result: BacktestResult
    trades: pd.DataFrame
    equity: pd.DataFrame
    overall: st.Stats
    groups: dict[str, pd.DataFrame]

    def to_markdown(self) -> str:
        r, s = self.result, self.overall
        pf = "inf" if s.profit_factor == float("inf") else f"{s.profit_factor:.2f}"
        lines = [
            f"# Backtest — {r.strategy_name}",
            "",
            f"- Generado: {datetime.now():%Y-%m-%d %H:%M}",
            f"- Pares: {', '.join(r.symbols)}",
            f"- Periodo: {r.start} → {r.end} (UTC)",
            f"- Velas base procesadas: {r.bars_processed:,}",
            "",
            "## Resultado global",
            "",
            "| Metrica | Valor |",
            "|---|---|",
            f"| Trades | {s.n_trades} |",
            f"| **Expectancy** | **{s.expectancy_r:+.3f} R** |",
            f"| Win rate | {s.win_rate:.1f}% |",
            f"| Profit factor | {pf} |",
            f"| R total acumulado | {s.total_r:+.1f} R |",
            f"| Ganancia media | {s.avg_win_r:+.2f} R |",
            f"| Perdida media | {s.avg_loss_r:+.2f} R |",
            f"| Mejor trade | {s.largest_win_r:+.2f} R |",
            f"| Peor trade | {s.largest_loss_r:+.2f} R |",
            f"| Desvio de R | {s.std_r:.2f} |",
            f"| SQN | {s.sqn:.2f} |",
            f"| **Max drawdown** | **{s.max_dd_pct:.2f}%** ({s.max_dd_money:,.2f} USD / {s.max_dd_r:.1f} R) |",
            f"| Racha perdedora mas larga | {s.longest_losing_streak} |",
            f"| Racha ganadora mas larga | {s.longest_winning_streak} |",
            f"| Velas promedio en posicion | {s.avg_bars_held:.0f} |",
            f"| Balance | {r.initial_balance:,.2f} → {r.final_balance:,.2f} USD |",
            f"| Costos totales | {r.total_costs:,.2f} USD ({s.costs_in_r:.1f} R) |",
            "",
            self._histogram_block(),
            "",
            self._prop_firm_block(),
            "",
            self._rejections_block(),
        ]
        for title, key in [
            ("Por regimen de TENDENCIA", "regime_tendencia"),
            ("Por VOLATILIDAD", "regime_volatilidad"),
            ("Por direccion del mercado", "regime_direccion"),
            ("Por dia de NOTICIA", "regime_noticia"),
            ("Por SESION", "session"),
            ("Por dia de la semana", "dia_semana"),
            ("Por par", "symbol"),
            ("Por direccion del trade", "side"),
            ("Por motivo de salida", "exit_reason"),
        ]:
            table = self.groups.get(key)
            if table is not None and len(table):
                lines += ["", f"## {title}", "", table.to_markdown(index=False)]

        lines += ["", self._reading_guide()]
        return "\n".join(lines)

    def _histogram_block(self) -> str:
        h = self.overall.r_histogram
        if not h:
            return "## Distribucion de R\n\nSin trades."
        total = sum(h.values())
        rows = ["## Distribucion de R", "",
                "El promedio esconde la forma. Esto es la forma.", "",
                "| Tramo | Trades | | %|", "|---|---:|---|---:|"]
        for k, v in h.items():
            bar = "#" * max(1, round(40 * v / total))
            rows.append(f"| {k} | {v} | `{bar}` | {100*v/total:.1f}% |")
        return "\n".join(rows)

    def _prop_firm_block(self) -> str:
        m = self.result.prop_firm
        if not m.config.enabled:
            return "## Reglas de prop firm\n\nDesactivadas en esta corrida."
        rows = [
            "## Reglas de prop firm", "",
            f"- Limite diario: {m.config.daily_drawdown_pct}% | "
            f"Limite total: {m.config.max_drawdown_pct}%"
            f"{' (trailing)' if m.config.trailing_max_drawdown else ' (estatico)'}",
            f"- Peor drawdown diario alcanzado: **{m.worst_daily_dd_pct:.2f}%**",
            f"- Violaciones del limite diario: **{sum(1 for b in m.breaches if b['kind']=='DAILY_DD')}**",
            f"- Violacion del limite total: **{'SI — cuenta perdida' if m.max_breached else 'no'}**",
            f"- Objetivo de ganancia alcanzado: {'SI' if m.target_reached else 'no'}",
        ]
        if m.breaches:
            rows += ["", "| Fecha | Tipo | Equity | Limite |", "|---|---|---:|---:|"]
            for b in m.breaches[:15]:
                rows.append(
                    f"| {b['ts']:%Y-%m-%d %H:%M} | {b['kind']} | "
                    f"{b['equity']:,.2f} | {b['limit']:,.2f} |"
                )
        return "\n".join(rows)

    def _rejections_block(self) -> str:
        rej = self.result.rejections
        if not rej:
            return (
                "## Señales rechazadas\n\nNinguna. La estrategia genero pocas señales o "
                "todas pasaron los filtros."
            )
        counts = pd.Series([r["reason"] for r in rej]).value_counts()
        rows = ["## Señales rechazadas", "",
                "Cuantas veces la estrategia quiso entrar y el motor lo impidio, y por que.",
                "Si este bloque tiene miles de rechazos y arriba hay tres trades, el problema",
                "no es la estrategia: es un filtro mal calibrado. Exactamente el modo de falla",
                "que dejo al bot MQL5 sin poder validarse nunca.", "",
                "| Motivo | Veces |", "|---|---:|"]
        for k, v in counts.items():
            rows.append(f"| {k} | {v} |")
        ejemplos = [r for r in rej if r.get("detail")][:5]
        if ejemplos:
            rows += ["", "Ejemplos:", ""]
            rows += [f"- `{e['ts']:%Y-%m-%d %H:%M}` {e['symbol']} — {e['reason']}: {e['detail']}"
                     for e in ejemplos]
        return "\n".join(rows)

    @staticmethod
    def _reading_guide() -> str:
        return (
            "---\n\n"
            "## Como leer esto\n\n"
            "**Expectancy en R** es la metrica que manda: cuanto gana o pierde la estrategia,\n"
            "en promedio, por cada unidad de riesgo. Positiva y estable es lo unico que importa.\n"
            "Un win rate del 70% con expectancy negativa es una estrategia perdedora con\n"
            "buena prensa.\n\n"
            "**El desglose por regimen es el punto de todo este reporte.** Una estrategia que\n"
            "gana en TENDENCIA y pierde en RANGO no es una estrategia mala: es una estrategia\n"
            "a la que le falta un filtro de regimen. Antes de tirar una estrategia con\n"
            "expectancy global cercana a cero, mirar si hay un regimen donde gana claramente.\n"
            "Si lo hay, el trabajo no es cambiar la estrategia: es agregarle el filtro.\n\n"
            "**El bloque de señales rechazadas** es el chequeo de cordura. Si la estrategia\n"
            "genero cientos de señales y el motor las rechazo casi todas, el resultado no\n"
            "dice nada sobre la estrategia.\n\n"
            "**Cantidad de trades:** por debajo de 30 trades no hay conclusion estadistica,\n"
            "hay anecdota. Por debajo de 100, la conclusion es provisoria.\n"
        )


def build(
    result: BacktestResult, data: dict[str, pd.DataFrame],
    news_csv: Path | None = None,
) -> Report:
    trades = result.trades_dataframe()
    equity = result.equity_dataframe()

    labels: dict[str, pd.DataFrame] = {}
    if len(trades):
        from .regime import RegimeConfig
        cfg = RegimeConfig(news_csv=news_csv)
        for symbol, df in data.items():
            labels[symbol] = label_days(df, cfg)
        trades = attach_regimes(trades, labels)

    eq = equity["equity"].to_numpy(dtype="float64") if len(equity) else None
    overall = st.compute(trades, eq)

    groups: dict[str, pd.DataFrame] = {}
    for col in ("regime_tendencia", "regime_volatilidad", "regime_direccion",
                "regime_noticia", "session", "dia_semana", "symbol", "side",
                "exit_reason"):
        if len(trades) and col in trades:
            groups[col] = st.by_group(trades, col)

    return Report(result, trades, equity, overall, groups)


def save(report: Report, out_dir: Path, name: str = "backtest") -> dict[str, Path]:
    """Guarda markdown + CSVs. La curva de equity queda exportable."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}

    md = out / f"{name}.md"
    md.write_text(report.to_markdown(), encoding="utf-8")
    paths["reporte"] = md

    if len(report.trades):
        p = out / f"{name}_trades.csv"
        report.trades.to_csv(p, index=False)
        paths["trades"] = p
    if len(report.equity):
        p = out / f"{name}_equity.csv"
        report.equity.to_csv(p, index=False)
        paths["equity"] = p
    if report.result.rejections:
        p = out / f"{name}_rechazos.csv"
        pd.DataFrame(report.result.rejections).to_csv(p, index=False)
        paths["rechazos"] = p
    return paths
