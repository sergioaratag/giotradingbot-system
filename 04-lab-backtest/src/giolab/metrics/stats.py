"""Metricas. La que manda es la expectancy en R.

Por que en R y no en dolares: R normaliza por el riesgo tomado. Una estrategia
que gana 500 USD arriesgando 100 por trade y otra que gana 500 arriesgando 400 no
son comparables en dolares, y si lo son en R. Ademas R es invariante al tamaño de
cuenta, asi que un backtest sobre 10k dice lo mismo que sobre 100k.

Por que el histograma y no solo el promedio: el promedio esconde la forma. Dos
sistemas con la misma expectancy, uno con muchas ganancias chicas y una perdida
enorme y otro parejo, se viven completamente distinto y solo uno se puede aguantar.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass(slots=True)
class Stats:
    n_trades: int = 0
    wins: int = 0
    losses: int = 0
    breakeven: int = 0
    win_rate: float = 0.0
    expectancy_r: float = 0.0
    expectancy_money: float = 0.0
    total_r: float = 0.0
    net_pnl: float = 0.0
    gross_profit: float = 0.0
    gross_loss: float = 0.0
    profit_factor: float = 0.0
    avg_win_r: float = 0.0
    avg_loss_r: float = 0.0
    largest_win_r: float = 0.0
    largest_loss_r: float = 0.0
    std_r: float = 0.0
    max_dd_pct: float = 0.0
    max_dd_money: float = 0.0
    max_dd_r: float = 0.0
    longest_losing_streak: int = 0
    longest_winning_streak: int = 0
    avg_bars_held: float = 0.0
    total_costs: float = 0.0
    costs_in_r: float = 0.0
    r_histogram: dict[str, int] = field(default_factory=dict)
    sqn: float = 0.0

    def as_row(self) -> dict:
        return {
            "trades": self.n_trades,
            "win_rate_%": round(self.win_rate, 1),
            "expectancy_R": round(self.expectancy_r, 3),
            "total_R": round(self.total_r, 2),
            "profit_factor": round(self.profit_factor, 2),
            "avg_win_R": round(self.avg_win_r, 2),
            "avg_loss_R": round(self.avg_loss_r, 2),
            "max_dd_%": round(self.max_dd_pct, 2),
            "max_dd_R": round(self.max_dd_r, 2),
            "racha_perdedora": self.longest_losing_streak,
            "net_pnl": round(self.net_pnl, 2),
            "SQN": round(self.sqn, 2),
        }


R_BINS: tuple[float, ...] = (-5, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 5, 10)


def r_histogram(r_values: np.ndarray) -> dict[str, int]:
    """Distribucion de R por tramos. Donde vive la verdad de una estrategia."""
    if len(r_values) == 0:
        return {}
    hist: dict[str, int] = {}
    edges = R_BINS
    hist[f"<{edges[0]}R"] = int((r_values < edges[0]).sum())
    for lo, hi in zip(edges, edges[1:]):
        hist[f"[{lo},{hi})R"] = int(((r_values >= lo) & (r_values < hi)).sum())
    hist[f">={edges[-1]}R"] = int((r_values >= edges[-1]).sum())
    return {k: v for k, v in hist.items() if v > 0}


def _streaks(r_values: np.ndarray) -> tuple[int, int]:
    longest_loss = longest_win = cur_loss = cur_win = 0
    for r in r_values:
        if r > 0:
            cur_win += 1; cur_loss = 0
        elif r < 0:
            cur_loss += 1; cur_win = 0
        else:
            cur_loss = cur_win = 0
        longest_loss = max(longest_loss, cur_loss)
        longest_win = max(longest_win, cur_win)
    return longest_loss, longest_win


def drawdown_from_equity(equity: np.ndarray) -> tuple[float, float]:
    """(max drawdown en %, en dinero) sobre una curva de equity."""
    if len(equity) == 0:
        return 0.0, 0.0
    peak = np.maximum.accumulate(equity)
    dd_money = peak - equity
    with np.errstate(divide="ignore", invalid="ignore"):
        dd_pct = np.where(peak > 0, dd_money / peak * 100.0, 0.0)
    return float(np.max(dd_pct)), float(np.max(dd_money))


def drawdown_in_r(r_values: np.ndarray) -> float:
    """Max drawdown de la curva acumulada de R. Independiente del sizing.

    El 0 inicial no es decorativo: sin el, una racha que empieza perdiendo mide
    mal. Con [-1,-1,-1] el pico es el punto de partida (0 R) y el drawdown es 3 R,
    no 2. Arrancar la curva en el primer trade se come el primer tramo de la caida.
    """
    if len(r_values) == 0:
        return 0.0
    cum = np.concatenate([[0.0], np.cumsum(r_values)])
    peak = np.maximum.accumulate(cum)
    return float(np.max(peak - cum))


def compute(trades_df: pd.DataFrame, equity: np.ndarray | None = None) -> Stats:
    s = Stats()
    if trades_df is None or len(trades_df) == 0:
        return s

    r = trades_df["r_multiple"].to_numpy(dtype="float64")
    pnl = trades_df["net_pnl"].to_numpy(dtype="float64")

    s.n_trades = len(r)
    s.wins = int((r > 0).sum())
    s.losses = int((r < 0).sum())
    s.breakeven = int((r == 0).sum())
    s.win_rate = 100.0 * s.wins / s.n_trades
    s.expectancy_r = float(r.mean())
    s.expectancy_money = float(pnl.mean())
    s.total_r = float(r.sum())
    s.net_pnl = float(pnl.sum())
    s.gross_profit = float(pnl[pnl > 0].sum())
    s.gross_loss = float(-pnl[pnl < 0].sum())
    s.profit_factor = (
        s.gross_profit / s.gross_loss if s.gross_loss > 0
        else (math.inf if s.gross_profit > 0 else 0.0)
    )
    s.avg_win_r = float(r[r > 0].mean()) if s.wins else 0.0
    s.avg_loss_r = float(r[r < 0].mean()) if s.losses else 0.0
    s.largest_win_r = float(r.max())
    s.largest_loss_r = float(r.min())
    s.std_r = float(r.std(ddof=1)) if s.n_trades > 1 else 0.0
    s.longest_losing_streak, s.longest_winning_streak = _streaks(r)
    s.avg_bars_held = float(trades_df["bars_held"].mean()) if "bars_held" in trades_df else 0.0
    if "costs" in trades_df:
        s.total_costs = float(trades_df["costs"].sum())
        risk = trades_df["risk_amount"].to_numpy(dtype="float64")
        with np.errstate(divide="ignore", invalid="ignore"):
            s.costs_in_r = float(np.nansum(np.where(risk > 0, trades_df["costs"] / risk, 0.0)))
    s.r_histogram = r_histogram(r)
    s.max_dd_r = drawdown_in_r(r)
    # SQN de Van Tharp: expectancy / desvio * raiz(n). >2 empieza a ser interesante.
    s.sqn = (s.expectancy_r / s.std_r * math.sqrt(s.n_trades)) if s.std_r > 0 else 0.0

    if equity is not None and len(equity):
        s.max_dd_pct, s.max_dd_money = drawdown_from_equity(np.asarray(equity, dtype="float64"))
    return s


def by_group(trades_df: pd.DataFrame, column: str) -> pd.DataFrame:
    """Metricas separadas por el valor de una columna. El corazon del analisis."""
    if trades_df is None or len(trades_df) == 0 or column not in trades_df:
        return pd.DataFrame()
    rows = []
    for value, group in trades_df.groupby(column, dropna=False):
        row = {column: value}
        row.update(compute(group).as_row())
        rows.append(row)
    out = pd.DataFrame(rows)
    return out.sort_values("trades", ascending=False).reset_index(drop=True)
