"""Resampling M1 -> timeframes superiores.

Si los bordes de vela caen donde no deben, todo lo que la estrategia mira esta
corrido y no hay forma de darse cuenta mirando la curva de equity.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from conftest import make_m1
from giolab.resample import build_multi_timeframe, resample


@pytest.fixture(scope="module")
def m1() -> pd.DataFrame:
    return make_m1(n=60 * 24 * 10, start="2025-02-03 00:00")


def test_los_bordes_de_h4_caen_en_horas_multiplo_de_4(m1):
    h4 = resample(m1, "H4")
    horas = sorted({ts.hour for ts in h4.index})
    assert horas == [0, 4, 8, 12, 16, 20]
    assert all(ts.minute == 0 for ts in h4.index)


@pytest.mark.parametrize("tf,minutos", [("M3", 3), ("M5", 5), ("M15", 15), ("M30", 30), ("H1", 60)])
def test_los_bordes_estan_alineados_a_medianoche_utc(m1, tf, minutos):
    out = resample(m1, tf)
    offsets = {(ts.hour * 60 + ts.minute) % minutos for ts in out.index}
    assert offsets == {0}, f"{tf}: hay velas que no arrancan en un borde de {minutos} min"


def test_el_ohlc_agregado_coincide_con_el_m1_de_adentro(m1):
    """La vela M15 tiene que ser exactamente el resumen de sus 15 velas M1."""
    m15 = resample(m1, "M15")
    for ts in m15.index[5:8]:
        trozo = m1[(m1.index >= ts) & (m1.index < ts + pd.Timedelta(minutes=15))]
        vela = m15.loc[ts]
        assert vela["open"] == pytest.approx(trozo["open"].iloc[0])
        assert vela["close"] == pytest.approx(trozo["close"].iloc[-1])
        assert vela["high"] == pytest.approx(trozo["high"].max())
        assert vela["low"] == pytest.approx(trozo["low"].min())
        assert vela["volume"] == pytest.approx(trozo["volume"].sum())


def test_el_high_nunca_baja_ni_el_low_sube_al_agregar(m1):
    for tf in ("M5", "M15", "H1", "H4"):
        out = resample(m1, tf)
        assert (out["high"] >= out["low"]).all()
        assert (out["high"] >= out[["open", "close"]].max(axis=1)).all()
        assert (out["low"] <= out[["open", "close"]].min(axis=1)).all()
        assert out["high"].max() <= m1["high"].max() + 1e-12
        assert out["low"].min() >= m1["low"].min() - 1e-12


def test_la_cantidad_de_velas_es_la_esperada(m1):
    m5 = resample(m1, "M5")
    assert len(m5) == pytest.approx(len(m1) / 5, rel=0.01)
    h1 = resample(m1, "H1")
    assert len(h1) == pytest.approx(len(m1) / 60, rel=0.01)


def test_d1_corta_en_el_rollover_de_las_17_ny_no_a_medianoche():
    """En verano el dia arranca a las 21:00 UTC; en invierno a las 22:00."""
    verano = make_m1(n=60 * 24 * 6, start="2025-07-07 00:00")
    d1_v = resample(verano, "D1")
    horas_v = {ts.hour for ts in d1_v.index[1:]}   # la primera es el borde de los datos
    assert horas_v == {21}, f"D1 en verano deberia arrancar a las 21 UTC, dio {horas_v}"

    invierno = make_m1(n=60 * 24 * 6, start="2025-01-13 00:00")
    d1_i = resample(invierno, "D1")
    horas_i = {ts.hour for ts in d1_i.index[1:]}
    assert horas_i == {22}, f"D1 en invierno deberia arrancar a las 22 UTC, dio {horas_i}"


def test_d1_sigue_al_cambio_de_horario_dentro_de_la_misma_serie():
    """Una serie que cruza el cambio de marzo tiene que mover el corte sola."""
    df = make_m1(n=60 * 24 * 14, start="2026-03-02 00:00")   # el cambio es el 8-mar-2026
    d1 = resample(df, "D1")
    horas = [ts.hour for ts in d1.index[1:]]
    assert 22 in horas, "antes del cambio el corte es a las 22 UTC"
    assert 21 in horas, "despues del cambio el corte es a las 21 UTC"


def test_no_quedan_velas_vacias_en_el_fin_de_semana():
    """Una vela sin ningun M1 adentro no existio: no es una vela en cero."""
    df = make_m1(n=60 * 24 * 10, start="2025-02-03 00:00")
    sin_finde = df[df.index.weekday < 5]
    h1 = resample(sin_finde, "H1")
    assert h1["open"].notna().all()
    assert not (h1.index.weekday >= 5).any()


def test_resamplear_m1_devuelve_lo_mismo(m1):
    assert resample(m1, "M1").equals(m1)


def test_timeframe_desconocido_falla_claro(m1):
    with pytest.raises(ValueError, match="Timeframe desconocido"):
        resample(m1, "M7")


def test_indice_naive_es_rechazado():
    df = make_m1(n=100)
    df.index = df.index.tz_localize(None)
    with pytest.raises(ValueError, match="UTC"):
        resample(df, "M5")


def test_build_multi_timeframe_no_duplica(m1):
    out = build_multi_timeframe(m1, ["M5", "m5", "H1", "M5"])
    assert sorted(out) == ["H1", "M5"]


def test_el_resampleo_es_idempotente_en_cascada(m1):
    """M1->H1 tiene que dar lo mismo que M1->M15->H1 (mismos bordes)."""
    directo = resample(m1, "H1")
    m15 = resample(m1, "M15")
    m15.index.name = "ts"
    cascada = resample(m15.rename_axis("ts"), "H1")
    comunes = directo.index.intersection(cascada.index)
    assert len(comunes) > 20
    for col in ("open", "high", "low", "close"):
        np.testing.assert_allclose(
            directo.loc[comunes, col].to_numpy(), cascada.loc[comunes, col].to_numpy(),
            rtol=1e-12, err_msg=f"la columna {col} difiere entre directo y cascada",
        )
