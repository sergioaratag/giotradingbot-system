"""Zonas horarias y DST en ambas direcciones.

El sistema anterior tenia UTC-4 hardcodeado. De noviembre a marzo TODAS sus
ventanas corrian una hora: killzones, reset diario, cierre del viernes. Cuatro o
cinco meses al año operando en el horario equivocado, sin que nada avisara.

Estos tests existen para que eso no pueda repetirse en silencio.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from giolab.clock import (
    NY, UTC, ensure_utc, is_ny_dst, ny_datetime, ny_offset_hours,
    ny_session_day, session_of, swap_multiplier, to_ny,
)
from giolab.types import Session


def utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=UTC)


def test_offset_invierno_es_menos_5():
    assert ny_offset_hours(utc("2026-01-15T12:00:00")) == -5.0
    assert not is_ny_dst(utc("2026-01-15T12:00:00"))


def test_offset_verano_es_menos_4():
    assert ny_offset_hours(utc("2026-07-15T12:00:00")) == -4.0
    assert is_ny_dst(utc("2026-07-15T12:00:00"))


@pytest.mark.parametrize("year,marzo,noviembre", [
    (2024, 10, 3), (2025, 9, 2), (2026, 8, 1), (2027, 14, 7),
])
def test_fechas_reales_de_cambio_de_horario(year, marzo, noviembre):
    """El cambio se mueve todos los años. Por eso no se puede hardcodear.

    En EEUU: segundo domingo de marzo (adelanta) y primer domingo de noviembre
    (atrasa). Se verifica el dia anterior y el posterior de cada cambio.
    """
    antes = utc(f"{year}-03-{marzo-1:02d}T12:00:00")
    despues = utc(f"{year}-03-{marzo+1:02d}T12:00:00")
    assert ny_offset_hours(antes) == -5.0, f"marzo {year}: antes del cambio debe ser -5"
    assert ny_offset_hours(despues) == -4.0, f"marzo {year}: despues debe ser -4"

    cambio_n = utc(f"{year}-11-{noviembre:02d}T12:00:00")
    antes_n = cambio_n - timedelta(days=1)   # puede caer en octubre
    despues_n = cambio_n + timedelta(days=1)
    assert ny_offset_hours(antes_n) == -4.0, f"noviembre {year}: antes debe ser -4"
    assert ny_offset_hours(despues_n) == -5.0, f"noviembre {year}: despues debe ser -5"


def test_offset_fijo_habria_fallado():
    """La demostracion concreta del bug del sistema anterior."""
    invierno = utc("2026-01-15T13:00:00")
    con_zoneinfo = to_ny(invierno).hour
    con_offset_fijo = (invierno + timedelta(hours=-4)).hour
    assert con_zoneinfo == 8
    assert con_offset_fijo == 9
    assert con_zoneinfo != con_offset_fijo, (
        "en enero, un offset fijo de -4 pone las 13:00 UTC en las 09:00 NY "
        "cuando en realidad son las 08:00: una hora de corrimiento"
    )


def test_la_misma_hora_ny_es_distinta_hora_utc_segun_la_estacion():
    """Las 08:30 NY (apertura de datos de EEUU) NO son la misma hora UTC todo el año."""
    invierno = ny_datetime(2026, 1, 15, 8, 30)
    verano = ny_datetime(2026, 7, 15, 8, 30)
    assert invierno.hour == 13 and invierno.minute == 30
    assert verano.hour == 12 and verano.minute == 30
    assert to_ny(invierno).hour == 8 and to_ny(verano).hour == 8


def test_sesiones_en_ambas_estaciones():
    """Las 09:00 NY caen en OVERLAP tanto en enero como en julio."""
    for mes in (1, 7):
        ts = ny_datetime(2026, mes, 15, 9, 0)
        assert session_of(ts) is Session.OVERLAP, f"mes {mes}"
    for mes in (1, 7):
        assert session_of(ny_datetime(2026, mes, 15, 4, 0)) is Session.LONDON
        assert session_of(ny_datetime(2026, mes, 15, 21, 0)) is Session.ASIA
        assert session_of(ny_datetime(2026, mes, 15, 13, 0)) is Session.NEW_YORK


def test_dia_de_sesion_corta_a_las_17_ny():
    assert ny_session_day(ny_datetime(2026, 7, 15, 16, 59)).day == 15
    assert ny_session_day(ny_datetime(2026, 7, 15, 17, 0)).day == 16
    assert ny_session_day(ny_datetime(2026, 1, 15, 16, 59)).day == 15
    assert ny_session_day(ny_datetime(2026, 1, 15, 17, 0)).day == 16


def test_el_corte_diario_sigue_al_dst():
    """El rollover de las 17:00 NY es 22:00 UTC en invierno y 21:00 en verano."""
    assert ny_datetime(2026, 1, 15, 17, 0).hour == 22
    assert ny_datetime(2026, 7, 15, 17, 0).hour == 21


def test_swap_triple_el_miercoles():
    miercoles = ny_datetime(2026, 7, 15, 17, 1)   # 15-jul-2026 es miercoles
    martes = ny_datetime(2026, 7, 14, 17, 1)
    assert swap_multiplier(miercoles) == 3.0
    assert swap_multiplier(martes) == 1.0


def test_naive_es_rechazado():
    with pytest.raises(ValueError, match="naive"):
        ensure_utc(datetime(2026, 1, 1, 12, 0))


def test_hora_ambigua_del_cambio_de_noviembre():
    """El 1-nov-2026 la 01:30 NY existe dos veces. No puede tirar excepcion."""
    for instante in ("2026-11-01T05:30:00", "2026-11-01T06:30:00"):
        ny = to_ny(utc(instante))
        assert ny.hour == 1 and ny.minute == 30
    assert ny_offset_hours(utc("2026-11-01T05:30:00")) == -4.0
    assert ny_offset_hours(utc("2026-11-01T06:30:00")) == -5.0


def test_hora_inexistente_del_cambio_de_marzo():
    """El 8-mar-2026 las 02:30 NY no existen: el reloj salta de 02:00 a 03:00."""
    antes = to_ny(utc("2026-03-08T06:59:00"))
    despues = to_ny(utc("2026-03-08T07:01:00"))
    assert antes.hour == 1
    assert despues.hour == 3, "el reloj salta las 02:xx"
