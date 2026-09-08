"""Position sizing.

El bug de sizing es el que produjo los 4 trades de junio 2026 que "no seguian la
estrategia". Un sizing incorrecto rompe todo lo que viene despues: si 1R no es lo
que uno cree, ninguna metrica en R significa nada.
"""

from __future__ import annotations

import pytest

from giolab.engine.risk import PositionSizer, RiskConfig
from giolab.types import EURUSD, GBPUSD


@pytest.fixture
def sizer() -> PositionSizer:
    return PositionSizer(RiskConfig())


def test_riesgo_pedido_es_riesgo_obtenido(sizer):
    """10.000 USD, 1% de riesgo, stop de 20 pips -> 0.50 lotes = 100 USD."""
    lots, risk, rej = sizer.lots_for(10_000, 1.0, 1.1000, 1.0980, EURUSD)
    assert rej is None
    assert lots == pytest.approx(0.50)
    assert risk == pytest.approx(100.0, abs=0.01)


def test_el_stop_mas_ancho_da_menos_lotes(sizer):
    """A igual riesgo en dinero, el doble de stop es la mitad de lotes."""
    l1, r1, _ = sizer.lots_for(10_000, 1.0, 1.1000, 1.0980, EURUSD)  # 20 pips
    l2, r2, _ = sizer.lots_for(10_000, 1.0, 1.1000, 1.0960, EURUSD)  # 40 pips
    assert l2 == pytest.approx(l1 / 2, abs=0.01)
    assert r1 == pytest.approx(r2, abs=0.5)


def test_el_riesgo_escala_con_la_cuenta(sizer):
    l1, _, _ = sizer.lots_for(10_000, 0.5, 1.1000, 1.0980, EURUSD)
    l2, _, _ = sizer.lots_for(20_000, 0.5, 1.1000, 1.0980, EURUSD)
    assert l2 == pytest.approx(l1 * 2, abs=0.01)


def test_el_redondeo_va_siempre_hacia_abajo(sizer):
    """Redondear hacia arriba significa arriesgar mas de lo autorizado."""
    lots, risk, _ = sizer.lots_for(10_000, 0.5, 1.1000, 1.0983, EURUSD)  # 17 pips
    assert lots <= 0.5 * 10_000 / 100 / (17 * 10)
    assert risk <= 50.0 + 1e-6, "el riesgo real nunca puede superar el pedido"


def test_tope_duro_de_riesgo(sizer):
    """Pedir 5% cuando el maximo es 1% da 1%, no 5%."""
    lots_5, risk_5, _ = sizer.lots_for(10_000, 5.0, 1.1000, 1.0980, EURUSD)
    lots_1, risk_1, _ = sizer.lots_for(10_000, 1.0, 1.1000, 1.0980, EURUSD)
    assert lots_5 == lots_1
    assert risk_5 == pytest.approx(100.0, abs=0.01)


def test_stop_demasiado_chico_se_rechaza_con_motivo(sizer):
    lots, _, rej = sizer.lots_for(10_000, 1.0, 1.1000, 1.09990, EURUSD)
    assert lots == 0.0
    assert rej is not None and "minimo" in rej


def test_stop_demasiado_ancho_se_rechaza(sizer):
    lots, _, rej = sizer.lots_for(10_000, 1.0, 1.1000, 1.0800, EURUSD)  # 200 pips
    assert lots == 0.0
    assert rej is not None and "maximo" in rej


def test_cuenta_muy_chica_se_rechaza_no_se_redondea_a_cero(sizer):
    """0.005 lotes no es 0.01: es "no se puede operar". Que lo diga."""
    lots, _, rej = sizer.lots_for(200, 0.5, 1.1000, 1.0980, EURUSD)
    assert lots == 0.0
    assert rej is not None and "minimo" in rej


def test_da_lo_mismo_comprar_que_vender(sizer):
    largo, r1, _ = sizer.lots_for(10_000, 1.0, 1.1000, 1.0980, EURUSD)
    corto, r2, _ = sizer.lots_for(10_000, 1.0, 1.1000, 1.1020, EURUSD)
    assert largo == corto
    assert r1 == pytest.approx(r2)


def test_funciona_igual_en_otro_par(sizer):
    lots, risk, _ = sizer.lots_for(10_000, 1.0, 1.2500, 1.2480, GBPUSD)
    assert lots == pytest.approx(0.50)
    assert risk == pytest.approx(100.0, abs=0.01)


def test_equity_cero_o_negativo_no_opera(sizer):
    assert sizer.lots_for(0, 1.0, 1.1, 1.098, EURUSD)[0] == 0.0
    assert sizer.lots_for(-500, 1.0, 1.1, 1.098, EURUSD)[0] == 0.0


def test_round_lot_respeta_el_paso():
    assert EURUSD.round_lot(0.237) == 0.23
    assert EURUSD.round_lot(0.2399) == 0.23
    assert EURUSD.round_lot(0.009) == 0.0
    assert EURUSD.round_lot(1000) == EURUSD.max_lot
