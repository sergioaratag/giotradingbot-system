"""Descarga por tandas con control adaptativo. Sin tocar la red.

Se reemplaza `fetch_hour` por un doble que simula un servidor con la maña real de
Dukascopy: cuanto mas concurrencia se le mete, peor responde.
"""

from __future__ import annotations

import threading
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from giolab.data import dukascopy


def test_las_horas_ya_en_cache_no_se_vuelven_a_pedir(tmp_path: Path):
    """Retomar una descarga cortada tiene que ser instantaneo."""
    horas = dukascopy.hours_between(date(2025, 6, 2), date(2025, 6, 3))
    for h in horas[:10]:
        p = dukascopy.cache_path(tmp_path, "EURUSD", h)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"x")

    pendientes, ya = dukascopy._pending_hours("EURUSD", horas, tmp_path)
    assert ya == 10
    assert len(pendientes) == len(horas) - 10
    assert all(not dukascopy.cache_path(tmp_path, "EURUSD", h).exists() for h in pendientes)


def test_el_mes_de_la_url_es_cero_indexado():
    """La trampa clasica de esta API: enero es 00, no 01."""
    enero = datetime(2024, 1, 15, 10, tzinfo=timezone.utc)
    diciembre = datetime(2024, 12, 15, 10, tzinfo=timezone.utc)
    assert "/2024/00/15/10h_ticks.bi5" in dukascopy.hour_url("EURUSD", enero)
    assert "/2024/11/15/10h_ticks.bi5" in dukascopy.hour_url("EURUSD", diciembre)


def test_la_concurrencia_baja_cuando_el_servidor_castiga(tmp_path, monkeypatch):
    """El comportamiento que importa: con muchos 503, apretar menos, no mas.

    El doble simula lo medido contra Dukascopy: con pocas conexiones responde
    bien, con muchas devuelve 503. Si el control adaptativo funciona, la
    concurrencia tiene que BAJAR.
    """
    activos = 0
    lock = threading.Lock()
    pico = []

    def servidor_hostil(symbol, hour, cache_dir=None, **kw):
        nonlocal activos
        with lock:
            activos += 1
            simultaneos = activos
            pico.append(simultaneos)
        try:
            if simultaneos > 3:
                return None, "http_503"
            p = dukascopy.cache_path(cache_dir, symbol, hour)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"")
            return b"", "empty"
        finally:
            with lock:
                activos -= 1

    monkeypatch.setattr(dukascopy, "fetch_hour", servidor_hostil)
    monkeypatch.setattr(dukascopy.time, "sleep", lambda s: None)

    _, informe = dukascopy.download_range(
        "EURUSD", date(2025, 6, 2), date(2025, 6, 4), tmp_path,
        workers=16, batch_size=20, pause=0.1, progress=False,
    )
    assert len(informe) > 0
    assert max(pico) < 16, (
        f"la concurrencia escalo hasta {max(pico)} pese a los 503: nunca hay que "
        "apretar mas cuando el servidor esta rechazando"
    )
    mitad = len(pico) // 2
    prom_antes = sum(pico[:mitad]) / mitad
    prom_despues = sum(pico[mitad:]) / (len(pico) - mitad)
    assert prom_despues < prom_antes, (
        f"la concurrencia no bajo ante los 503 ({prom_antes:.1f} -> {prom_despues:.1f}): "
        "el control adaptativo no funciona"
    )


def test_un_404_no_es_un_fallo(tmp_path, monkeypatch):
    """Un 404 es "esa hora no existe" (feriado, fin de semana). No hay que reintentarlo."""
    monkeypatch.setattr(dukascopy, "fetch_hour", lambda *a, **k: (None, "http_404"))
    monkeypatch.setattr(dukascopy.time, "sleep", lambda s: None)
    _, informe = dukascopy.download_range(
        "EURUSD", date(2025, 6, 2), date(2025, 6, 3), tmp_path,
        workers=4, batch_size=10, progress=False,
    )
    assert all(r.status == "http_404" for r in informe)


def test_decodificar_un_bi5_vacio_no_rompe():
    assert len(dukascopy.decode_ticks(b"", "EURUSD", datetime(2025, 1, 1, tzinfo=timezone.utc))) == 0
    basura = dukascopy.decode_ticks(b"no soy lzma", "EURUSD",
                                    datetime(2025, 1, 1, tzinfo=timezone.utc))
    assert len(basura) == 0


def test_hours_between_saltea_el_sabado_cerrado():
    horas = dukascopy.hours_between(date(2025, 6, 7), date(2025, 6, 7))  # sabado
    assert all(h.hour >= 20 for h in horas), "el sabado antes de las 20 UTC el mercado esta cerrado"
