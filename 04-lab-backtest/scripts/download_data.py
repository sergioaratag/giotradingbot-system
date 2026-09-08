#!/usr/bin/env python3
"""Baja datos historicos M1 y los guarda en Parquet.

Uso tipico (tres años de los dos pares):

    python scripts/download_data.py --symbols EURUSD GBPUSD --years 3

Se puede cortar y retomar: los archivos crudos quedan en data/raw/ y en la
siguiente corrida no se vuelven a bajar.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import pandas as pd  # noqa: E402

from giolab.data import dukascopy, histdata, quality, store  # noqa: E402
from giolab.types import INSTRUMENTS  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--symbols", nargs="+", default=["EURUSD", "GBPUSD"])
    ap.add_argument("--years", type=float, default=3.0)
    ap.add_argument("--start", help="AAAA-MM-DD; tiene prioridad sobre --years")
    ap.add_argument("--end", help="AAAA-MM-DD (por defecto, ayer)")
    ap.add_argument("--source", choices=["dukascopy", "histdata"], default="dukascopy")
    ap.add_argument("--workers", type=int, default=12,
                    help="descargas en paralelo. Mas de 16 hace que Dukascopy corte")
    ap.add_argument("--raw-dir", default=str(ROOT / "data" / "raw"))
    ap.add_argument("--out-dir", default=str(ROOT / "data" / "m1"))
    args = ap.parse_args()

    end = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)
    start = (date.fromisoformat(args.start) if args.start
             else end - timedelta(days=int(args.years * 365.25)))
    raw_dir, out_dir = Path(args.raw_dir), Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Fuente: {args.source} | Periodo: {start} -> {end} | Pares: {', '.join(args.symbols)}")
    print()

    fallos = 0
    for symbol in args.symbols:
        print(f"=== {symbol} ===", flush=True)
        if args.source == "dukascopy":
            df, informe = dukascopy.download_range(
                symbol, start, end, raw_dir, workers=args.workers
            )
            fallidas = [r for r in informe if r.status not in ("ok", "cache", "empty", "http_404")]
            if fallidas:
                fallos += len(fallidas)
                print(f"  ATENCION: {len(fallidas)} horas no se pudieron bajar. "
                      f"Volve a correr el comando para reintentarlas.")
                for r in fallidas[:5]:
                    print(f"    {r.hour} -> {r.status}")
        else:
            df, informe = histdata.download_range(
                symbol, start.year, start.month, end.year, end.month, raw_dir
            )

        if df is None or len(df) == 0:
            print(f"  Sin datos para {symbol}.\n")
            fallos += 1
            continue

        path = store.m1_path(out_dir, symbol)
        if path.exists():
            df = store.merge_m1(store.load_m1(out_dir, symbol), df)
        saved = store.save_m1(df, out_dir, symbol)
        inst = INSTRUMENTS.get(symbol)
        rep = quality.analyze(df, symbol,
                              pip_size=inst.pip_size if inst else 0.0001,
                              point_size=inst.point_size if inst else 0.00001)
        print(f"  Guardado: {saved} ({saved.stat().st_size/1024/1024:.1f} MB)")
        print(f"  {rep.n_bars:,} velas | cobertura {rep.coverage_pct:.1f}% | "
              f"spread real: {'si' if rep.has_real_spread else 'NO'} | "
              f"huecos en dia habil: {len(rep.weekday_gaps)}")
        print()

    print("Listo. Informe completo de calidad:")
    print("  python scripts/data_quality_report.py")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
