#!/usr/bin/env python3
"""Corre un backtest y escribe el reporte.

    python scripts/run_backtest.py --strategy demo_ma_cross --symbols EURUSD

La estrategia se pasa por nombre de modulo dentro de src/giolab/strategies/.
El modulo tiene que exponer una clase que implemente el contrato Strategy.
"""

from __future__ import annotations

import argparse
import importlib
import inspect
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from giolab.data import store  # noqa: E402
from giolab.engine.costs import CostConfig  # noqa: E402
from giolab.engine.engine import Backtest, EngineConfig  # noqa: E402
from giolab.engine.risk import PropFirmConfig, RiskConfig  # noqa: E402
from giolab.metrics import report as report_mod  # noqa: E402
from giolab.strategy import BaseStrategy  # noqa: E402


def load_strategy(name: str):
    module = importlib.import_module(f"giolab.strategies.{name}")
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if obj is BaseStrategy or obj.__module__ != module.__name__:
            continue
        if hasattr(obj, "on_bar"):
            return obj
    raise SystemExit(f"No encontre ninguna estrategia en giolab.strategies.{name}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--strategy", default="demo_ma_cross")
    ap.add_argument("--symbols", nargs="+", default=["EURUSD"])
    ap.add_argument("--start"); ap.add_argument("--end")
    ap.add_argument("--balance", type=float, default=10_000.0)
    ap.add_argument("--risk", type=float, default=0.5, help="%% de riesgo por trade")
    ap.add_argument("--spread-multiplier", type=float, default=1.0,
                    help="2.0 corre el mismo backtest con el doble de spread")
    ap.add_argument("--no-prop-firm", action="store_true")
    ap.add_argument("--news-csv", help="CSV de dias con noticia roja")
    ap.add_argument("--data-dir", default=str(ROOT / "data" / "m1"))
    ap.add_argument("--out-dir", default=str(ROOT / "data" / "reports"))
    ap.add_argument("--name", help="nombre del archivo de salida")
    args = ap.parse_args()

    data = {}
    for symbol in args.symbols:
        data[symbol] = store.load_m1(Path(args.data_dir), symbol, args.start, args.end)
        print(f"{symbol}: {len(data[symbol]):,} velas M1 "
              f"({data[symbol].index[0]} -> {data[symbol].index[-1]})")

    strategy_cls = load_strategy(args.strategy)
    cfg = EngineConfig(
        initial_balance=args.balance,
        costs=CostConfig(spread_multiplier=args.spread_multiplier),
        risk=RiskConfig(default_risk_pct=args.risk),
        prop_firm=PropFirmConfig(enabled=not args.no_prop_firm,
                                 initial_balance=args.balance),
    )

    print(f"\nCorriendo {strategy_cls.__name__} ...", flush=True)
    result = Backtest(strategy_cls, data, cfg).run()

    news = Path(args.news_csv) if args.news_csv else None
    rep = report_mod.build(result, data, news_csv=news)
    name = args.name or f"{args.strategy}_{'_'.join(args.symbols)}"
    paths = report_mod.save(rep, Path(args.out_dir), name)

    s = rep.overall
    print(f"\n{'='*60}")
    print(f"  trades: {s.n_trades}   expectancy: {s.expectancy_r:+.3f} R   "
          f"win rate: {s.win_rate:.1f}%")
    print(f"  max drawdown: {s.max_dd_pct:.2f}%   balance final: {result.final_balance:,.2f}")
    if s.n_trades < 30:
        print(f"  AVISO: {s.n_trades} trades es muy poco. Esto es anecdota, no estadistica.")
    print(f"{'='*60}\n")
    for k, v in paths.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
