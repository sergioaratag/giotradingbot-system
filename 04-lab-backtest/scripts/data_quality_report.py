#!/usr/bin/env python3
"""Informe de calidad de los datos guardados.

Correr esto ANTES de creerle a cualquier backtest.

    python scripts/data_quality_report.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from giolab.data import quality, store  # noqa: E402
from giolab.types import INSTRUMENTS  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", default=str(ROOT / "data" / "m1"))
    ap.add_argument("--out-dir", default=str(ROOT / "data" / "reports"))
    ap.add_argument("--symbols", nargs="*")
    args = ap.parse_args()

    data_dir, out_dir = Path(args.data_dir), Path(args.out_dir)
    disponibles = store.available(data_dir)
    if not disponibles:
        print(f"No hay datos en {data_dir}.")
        print("Corre primero:  python scripts/download_data.py --years 3")
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    partes = ["# Informe de calidad de datos", ""]
    for symbol in (args.symbols or sorted(disponibles)):
        if symbol not in disponibles:
            print(f"  {symbol}: no hay datos guardados")
            continue
        df = store.load_m1(data_dir, symbol)
        inst = INSTRUMENTS.get(symbol)
        rep = quality.analyze(df, symbol,
                              pip_size=inst.pip_size if inst else 0.0001,
                              point_size=inst.point_size if inst else 0.00001)
        partes += [rep.summary(), "", "---", ""]
        print(f"{symbol}: {rep.n_bars:,} velas | cobertura {rep.coverage_pct:.2f}% | "
              f"spread real {'SI' if rep.has_real_spread else 'NO'} | "
              f"{len(rep.weekday_gaps)} huecos en dia habil")

    destino = out_dir / "calidad_datos.md"
    destino.write_text("\n".join(partes), encoding="utf-8")
    print(f"\nInforme escrito en: {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
