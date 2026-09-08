"""Metricas y clasificacion por regimen."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from conftest import make_m1
from giolab.metrics import stats as st
from giolab.metrics.regime import attach_regimes, label_days


def trades_df(r_values, symbol="EURUSD") -> pd.DataFrame:
    n = len(r_values)
    return pd.DataFrame({
        "r_multiple": r_values,
        "net_pnl": np.array(r_values) * 100.0,
        "bars_held": [10] * n,
        "costs": [5.0] * n,
        "risk_amount": [100.0] * n,
        "symbol": [symbol] * n,
        "entry_ts": pd.date_range("2025-03-03 10:00", periods=n, freq="D", tz="UTC"),
    })


def test_expectancy_es_el_promedio_de_r():
    s = st.compute(trades_df([1.0, -1.0, 2.0, -1.0]))
    assert s.expectancy_r == pytest.approx(0.25)
    assert s.total_r == pytest.approx(1.0)


def test_win_rate_alto_con_expectancy_negativa():
    """El caso que hay que poder detectar: 80% de aciertos y perdida neta."""
    s = st.compute(trades_df([0.2] * 8 + [-5.0, -5.0]))
    assert s.win_rate == pytest.approx(80.0)
    assert s.expectancy_r < 0
    assert s.profit_factor < 1.0


def test_profit_factor():
    s = st.compute(trades_df([2.0, 2.0, -1.0, -1.0]))
    assert s.profit_factor == pytest.approx(2.0)


def test_sin_perdedores_el_profit_factor_es_infinito():
    assert st.compute(trades_df([1.0, 2.0])).profit_factor == float("inf")


def test_rachas():
    s = st.compute(trades_df([1.0, -1, -1, -1, 1.0, -1, -1, 2.0, 1.0, 1.0]))
    assert s.longest_losing_streak == 3
    assert s.longest_winning_streak == 3


def test_el_histograma_muestra_la_forma_que_el_promedio_esconde():
    """Dos sistemas con la misma expectancy y formas opuestas."""
    parejo = st.compute(trades_df([0.5] * 10 + [-0.4] * 10))
    loteria = st.compute(trades_df([10.0] + [-0.4737] * 19))  # misma expectancy: (10-19*0.4737)/20
    assert parejo.expectancy_r == pytest.approx(loteria.expectancy_r, abs=0.02)
    assert parejo.r_histogram != loteria.r_histogram
    assert parejo.std_r < loteria.std_r
    assert parejo.sqn > loteria.sqn


def test_sin_trades_no_rompe():
    s = st.compute(pd.DataFrame())
    assert s.n_trades == 0 and s.expectancy_r == 0.0


def test_agrupar_separa_lo_que_el_global_promedia():
    """El punto de todo el reporte por regimen."""
    df = pd.concat([
        trades_df([1.5, 1.2, 1.8, 1.4]).assign(regimen="TENDENCIA"),
        trades_df([-1.0, -1.0, -0.9, -1.0]).assign(regimen="RANGO"),
    ], ignore_index=True)
    global_ = st.compute(df)
    assert abs(global_.expectancy_r) < 0.3, "el global se ve mediocre"

    por_regimen = st.by_group(df, "regimen")
    tendencia = por_regimen[por_regimen["regimen"] == "TENDENCIA"].iloc[0]
    rango = por_regimen[por_regimen["regimen"] == "RANGO"].iloc[0]
    assert tendencia["expectancy_R"] > 1.0, (
        "en tendencia la estrategia es claramente buena, y el global lo escondia"
    )
    assert rango["expectancy_R"] < -0.9


# ------------------------------------------------------------- regimen
@pytest.fixture(scope="module")
def m1_largo() -> pd.DataFrame:
    return make_m1(n=60 * 24 * 200, start="2024-01-01 00:00", seed=13)


def test_las_etiquetas_cubren_todos_los_dias(m1_largo):
    lab = label_days(m1_largo)
    assert len(lab) > 150
    for col in ("tendencia", "volatilidad", "direccion", "noticia"):
        assert col in lab.columns
        assert lab[col].notna().all()


def test_los_valores_de_las_etiquetas_son_los_esperados(m1_largo):
    lab = label_days(m1_largo)
    assert set(lab["tendencia"]) <= {"TENDENCIA", "RANGO", "TRANSICION", "SIN_DATOS"}
    assert set(lab["volatilidad"]) <= {"ALTA", "NORMAL", "BAJA", "SIN_DATOS"}
    assert set(lab["direccion"]) <= {"ALCISTA", "BAJISTA", "LATERAL", "SIN_DATOS"}


def test_sin_calendario_de_noticias_dice_sin_datos_no_limpio(m1_largo):
    """Marcar los dias como limpios sin tener el calendario seria inventar."""
    lab = label_days(m1_largo)
    assert set(lab["noticia"]) == {"SIN_DATOS"}


def test_las_etiquetas_no_usan_el_futuro(m1_largo):
    """La etiqueta de un dia tiene que ser calculable al cierre del dia anterior.

    Se verifica recortando la serie: la etiqueta de un dia no puede cambiar
    porque exista o no informacion posterior a ese dia.
    """
    completo = label_days(m1_largo)
    corte = len(m1_largo) * 2 // 3
    recortado = label_days(m1_largo.iloc[:corte])
    comunes = recortado.index.intersection(completo.index)[10:-2]
    assert len(comunes) > 50
    for col in ("tendencia", "volatilidad", "direccion"):
        iguales = (completo.loc[comunes, col].to_numpy() == recortado.loc[comunes, col].to_numpy())
        assert iguales.all(), (
            f"la etiqueta {col} cambia al conocer datos posteriores: usa el futuro"
        )


def test_attach_regimes_pega_las_etiquetas_a_los_trades(m1_largo):
    lab = label_days(m1_largo)
    df = trades_df([1.0, -1.0, 2.0])
    df["entry_ts"] = pd.to_datetime(
        [f"2024-0{m}-15 14:00" for m in (3, 4, 5)], utc=True
    )
    df["side"] = "BUY"
    df["session"] = ""
    out = attach_regimes(df, {"EURUSD": lab})
    for col in ("regime_tendencia", "regime_volatilidad", "dia_semana", "session"):
        assert col in out.columns
        assert out[col].notna().all()
    assert set(out["session"]) <= {"LONDON", "OVERLAP", "NEW_YORK", "ASIA", "OFF"}
