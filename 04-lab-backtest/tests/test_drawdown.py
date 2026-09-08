"""Drawdown diario y total, con reglas de prop firm.

Lo que hace reprobar evaluaciones no es la falta de edge: es pegarle al limite
diario en una mala racha. Estos tests fijan como se mide.
"""

from __future__ import annotations

import numpy as np
import pytest

from giolab.clock import ny_datetime
from giolab.engine.risk import PropFirmConfig, PropFirmMonitor
from giolab.metrics.stats import drawdown_from_equity, drawdown_in_r


@pytest.fixture
def monitor() -> PropFirmMonitor:
    return PropFirmMonitor(PropFirmConfig(
        initial_balance=10_000, daily_drawdown_pct=4.0, max_drawdown_pct=8.0,
    ))


def test_dentro_de_limites_no_dispara(monitor):
    monitor.update(ny_datetime(2026, 3, 2, 10), 10_000, 9_700)  # -3%
    assert not monitor.daily_breached
    assert not monitor.max_breached
    assert monitor.can_open()[0]


def test_limite_diario_dispara_al_4_por_ciento(monitor):
    monitor.update(ny_datetime(2026, 3, 2, 10), 10_000, 9_599)  # -4.01%
    assert monitor.daily_breached
    assert not monitor.max_breached
    ok, why = monitor.can_open()
    assert not ok and "daily" in why.lower()


def test_limite_total_dispara_al_8_por_ciento(monitor):
    monitor.update(ny_datetime(2026, 3, 2, 10), 10_000, 9_150)
    assert monitor.max_breached
    assert monitor.blown
    assert not monitor.can_open()[0]


def test_el_limite_diario_se_resetea_al_dia_siguiente(monitor):
    monitor.update(ny_datetime(2026, 3, 2, 10), 10_000, 9_500)
    assert monitor.daily_breached
    monitor.update(ny_datetime(2026, 3, 3, 10), 9_500, 9_500)
    assert not monitor.daily_breached
    assert monitor.can_open()[0]


def test_el_limite_total_no_se_resetea_nunca(monitor):
    monitor.update(ny_datetime(2026, 3, 2, 10), 10_000, 9_100)
    assert monitor.max_breached
    monitor.update(ny_datetime(2026, 3, 3, 10), 9_100, 9_900)
    assert monitor.max_breached, "una cuenta perdida no se recupera al dia siguiente"
    assert not monitor.can_open()[0]


def test_el_dia_corta_a_las_17_ny_no_a_medianoche():
    """Una perdida a las 18:00 NY cuenta contra el dia SIGUIENTE.

    Medir por fecha calendario corre el corte y da un drawdown diario que la
    prop firm no reconoce.
    """
    m = PropFirmMonitor(PropFirmConfig(initial_balance=10_000))
    m.update(ny_datetime(2026, 3, 2, 16, 0), 10_000, 9_800)   # dia 2
    dia_antes = m.day
    m.update(ny_datetime(2026, 3, 2, 18, 0), 9_800, 9_800)    # ya es el dia 3
    assert m.day != dia_antes
    assert m.day.day == 3
    assert m.day_start_balance == 9_800, "el nuevo dia arranca con el balance del momento"


def test_drawdown_trailing_es_mas_duro_que_estatico():
    """Con trailing, ganar sube el piso. Es la diferencia entre aprobar y no."""
    estatico = PropFirmMonitor(PropFirmConfig(
        initial_balance=10_000, max_drawdown_pct=8.0, trailing_max_drawdown=False))
    trailing = PropFirmMonitor(PropFirmConfig(
        initial_balance=10_000, max_drawdown_pct=8.0, trailing_max_drawdown=True))
    for m in (estatico, trailing):
        m.update(ny_datetime(2026, 3, 2, 10), 10_000, 12_000)   # sube a 12k
        m.update(ny_datetime(2026, 3, 3, 10), 12_000, 11_000)   # baja a 11k
    assert not estatico.max_breached, "9.200 es el piso estatico: 11.000 esta a salvo"
    assert trailing.max_breached, "con trailing el piso subio a 11.040: 11.000 lo viola"


def test_drawdown_diario_desde_pico_es_mas_duro():
    desde_balance = PropFirmMonitor(PropFirmConfig(
        initial_balance=10_000, daily_drawdown_pct=4.0, daily_dd_from_equity_peak=False))
    desde_pico = PropFirmMonitor(PropFirmConfig(
        initial_balance=10_000, daily_drawdown_pct=4.0, daily_dd_from_equity_peak=True))
    for m in (desde_balance, desde_pico):
        m.update(ny_datetime(2026, 3, 2, 8), 10_000, 10_000)
        m.update(ny_datetime(2026, 3, 2, 10), 10_000, 10_500)  # pico del dia
        m.update(ny_datetime(2026, 3, 2, 14), 10_000, 9_700)   # -3% del balance, -7,6% del pico
    assert not desde_balance.daily_breached
    assert desde_pico.daily_breached


def test_peor_drawdown_diario_queda_registrado(monitor):
    monitor.update(ny_datetime(2026, 3, 2, 8), 10_000, 10_000)
    monitor.update(ny_datetime(2026, 3, 2, 12), 10_000, 9_700)
    monitor.update(ny_datetime(2026, 3, 2, 16), 10_000, 9_900)
    assert monitor.worst_daily_dd_pct == pytest.approx(3.0, abs=0.01)


def test_objetivo_de_ganancia(monitor):
    monitor.update(ny_datetime(2026, 3, 2, 10), 10_800, 10_801)
    assert monitor.target_reached


# --------------------------------------------------- metricas de drawdown
def test_max_drawdown_sobre_curva_de_equity():
    equity = np.array([10_000, 11_000, 10_000, 12_000, 9_000, 13_000], dtype="float64")
    pct, money = drawdown_from_equity(equity)
    assert money == pytest.approx(3_000.0)          # de 12.000 a 9.000
    assert pct == pytest.approx(25.0)               # 3.000 / 12.000


def test_curva_que_solo_sube_no_tiene_drawdown():
    pct, money = drawdown_from_equity(np.array([100.0, 110.0, 120.0]))
    assert pct == 0.0 and money == 0.0


def test_drawdown_en_r_es_independiente_del_sizing():
    r = np.array([1.0, -1.0, -1.0, -1.0, 2.0])
    assert drawdown_in_r(r) == pytest.approx(3.0)   # de +1 a -2


def test_drawdown_en_r_de_una_racha_perdedora_pura():
    assert drawdown_in_r(np.array([-1.0, -1.0, -1.0])) == pytest.approx(3.0)
