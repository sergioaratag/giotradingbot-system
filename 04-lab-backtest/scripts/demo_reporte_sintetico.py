#!/usr/bin/env python3
"""Genera un reporte de EJEMPLO con datos INVENTADOS.

    python scripts/demo_reporte_sintetico.py

Para que sirve: para ver como se ve un reporte completo —con el desglose por
regimen poblado— sin tener que esperar a bajar tres años de datos reales.

============================================================================
  LOS DATOS SON INVENTADOS. LOS NUMEROS NO SIGNIFICAN NADA.
  No sacar ninguna conclusion sobre ninguna estrategia a partir de esto.
  Es una muestra del FORMATO del reporte, no un resultado.
============================================================================
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from giolab.engine.engine import Backtest, EngineConfig  # noqa: E402
from giolab.engine.risk import PropFirmConfig  # noqa: E402
from giolab.metrics import report as report_mod  # noqa: E402
from giolab.strategies.demo_ma_cross import DemoMACross  # noqa: E402


def datos_inventados(dias: int = 400, seed: int = 20260908) -> pd.DataFrame:
    """Serie con tramos de tendencia y tramos de rango, para que el etiquetador
    de regimen tenga algo distinto que etiquetar."""
    rng = np.random.default_rng(seed)
    n = 60 * 24 * dias
    idx = pd.date_range("2024-01-01", periods=n, freq="1min", tz="UTC")

    # bloques alternados de tendencia y rango, de ~20 dias cada uno
    bloque = 60 * 24 * 20
    deriva = np.zeros(n)
    vol = np.full(n, 0.00007)
    for i, inicio in enumerate(range(0, n, bloque)):
        fin = min(inicio + bloque, n)
        if i % 2 == 0:
            deriva[inicio:fin] = 0.0000012 * (1 if (i // 2) % 2 == 0 else -1)
            vol[inicio:fin] = 0.00009
        else:
            vol[inicio:fin] = 0.00004
    close = 1.10 + np.cumsum(rng.normal(deriva, vol))
    mecha = np.abs(rng.normal(0, 0.00009, n))
    open_ = np.concatenate([[close[0]], close[:-1]])
    df = pd.DataFrame({
        "open": open_,
        "high": np.maximum(open_, close) + mecha,
        "low": np.minimum(open_, close) - mecha,
        "close": close,
        "volume": rng.uniform(1, 50, n),
        "spread_mean": np.where(
            (idx.hour >= 22) | (idx.hour < 6), 25.0, 12.0),  # Asia mas caro
        "spread_max": 60.0,
    }, index=idx)
    return df[idx.weekday < 5]  # sin fin de semana


def main() -> int:
    print(__doc__)
    df = datos_inventados()
    print(f"Datos INVENTADOS: {len(df):,} velas M1 ({df.index[0]} -> {df.index[-1]})\n")

    # Prop firm apagada A PROPOSITO en este ejemplo: con los limites puestos, la
    # estrategia de prueba pierde la cuenta a las tres semanas y el motor se corta,
    # y entonces el desglose por regimen queda vacio. Aca queremos mostrar el
    # formato completo del reporte. En un backtest de verdad va prendida.
    cfg = EngineConfig(prop_firm=PropFirmConfig(enabled=False))
    result = Backtest(DemoMACross, {"EURUSD": df}, cfg).run()
    rep = report_mod.build(result, {"EURUSD": df})

    out = ROOT / "data" / "reports"
    paths = report_mod.save(rep, out, "EJEMPLO_datos_inventados")

    # aviso al principio del archivo, para que nadie lo confunda con un resultado
    md = paths["reporte"]
    aviso = (
        "> # ⚠️ DATOS INVENTADOS\n"
        "> Este reporte se generó con precios sintéticos para mostrar el FORMATO.\n"
        "> Los números no significan absolutamente nada. No decidir nada con esto.\n\n"
    )
    md.write_text(aviso + md.read_text(encoding="utf-8"), encoding="utf-8")

    s = rep.overall
    print(f"trades: {s.n_trades} | expectancy: {s.expectancy_r:+.3f} R "
          f"(que, insistimos, no significa nada)")
    for k, v in paths.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
