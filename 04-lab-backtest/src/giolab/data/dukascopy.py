"""Descarga de ticks historicos de Dukascopy.

Por que Dukascopy y no HistData: Dukascopy entrega TICKS con bid y ask separados.
Eso da el spread REAL de cada momento, que es lo unico que permite modelar costos
con honestidad. HistData entrega M1 con un solo precio: el spread hay que
inventarlo, y un spread inventado es un costo inventado.

Formato .bi5: LZMA (formato alone) sobre registros de 20 bytes big-endian:
    uint32  milisegundos desde el inicio de la hora
    uint32  ask en puntos enteros
    uint32  bid en puntos enteros
    float32 volumen ask
    float32 volumen bid

URL: /datafeed/{SIMBOLO}/{AAAA}/{MM}/{DD}/{HH}h_ticks.bi5
     OJO: el mes es 0-indexado. Enero es 00. Es la trampa clasica de esta API.

Los timestamps de Dukascopy vienen en UTC. Se guardan en UTC, sin excepcion.
"""

from __future__ import annotations

import lzma
import struct
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

BASE_URL = "https://datafeed.dukascopy.com/datafeed"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) giolab-backtest/1.0"
RECORD = struct.Struct(">IIIff")

# Factor de escala de los precios enteros. 1e5 para pares de 5 digitos.
POINT_SCALE: dict[str, float] = {"EURUSD": 1e5, "GBPUSD": 1e5, "USDJPY": 1e3}


@dataclass(slots=True)
class HourResult:
    hour: datetime
    n_ticks: int
    status: str  # ok | empty | http_404 | http_error | failed


def hour_url(symbol: str, hour: datetime) -> str:
    return (
        f"{BASE_URL}/{symbol}/{hour.year:04d}/{hour.month - 1:02d}/"
        f"{hour.day:02d}/{hour.hour:02d}h_ticks.bi5"
    )


def cache_path(cache_dir: Path, symbol: str, hour: datetime) -> Path:
    return (
        cache_dir / symbol / f"{hour.year:04d}" / f"{hour.month:02d}"
        / f"{hour.day:02d}" / f"{hour.hour:02d}h_ticks.bi5"
    )


def fetch_hour(
    symbol: str, hour: datetime, cache_dir: Path | None = None,
    retries: int = 2, timeout: float = 10.0,
) -> tuple[bytes | None, str]:
    """Baja una hora de ticks. Devuelve (bytes crudos, estado).

    Un 404 significa "esa hora no existe" (fin de semana, feriado). No es un
    error: es informacion. Se distingue de un fallo de red porque un hueco de
    fin de semana es normal y un hueco por timeout es un dato perdido.
    """
    if cache_dir is not None:
        cached = cache_path(cache_dir, symbol, hour)
        if cached.exists():
            return cached.read_bytes(), "cache"

    url = hour_url(symbol, hour)
    last = "failed"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            if cache_dir is not None:
                p = cache_path(cache_dir, symbol, hour)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(data)
            return data, ("ok" if data else "empty")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, "http_404"
            last = f"http_{e.code}"
        except Exception as e:  # timeout, DNS, reset
            last = f"error_{type(e).__name__}"
        time.sleep(0.4 * (2 ** attempt))  # backoff exponencial
    return None, last


def decode_ticks(raw: bytes, symbol: str, hour: datetime) -> pd.DataFrame:
    """bi5 comprimido -> DataFrame de ticks con indice UTC."""
    if not raw:
        return _empty_ticks()
    try:
        data = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE).decompress(raw)
    except lzma.LZMAError:
        return _empty_ticks()
    n = len(data) // RECORD.size
    if n == 0:
        return _empty_ticks()

    arr = np.frombuffer(
        data[: n * RECORD.size],
        dtype=np.dtype([("ms", ">u4"), ("ask", ">u4"), ("bid", ">u4"),
                        ("av", ">f4"), ("bv", ">f4")]),
    )
    scale = POINT_SCALE.get(symbol, 1e5)
    base = np.datetime64(hour.replace(tzinfo=None), "ms")
    ts = base + arr["ms"].astype("int64").astype("timedelta64[ms]")
    df = pd.DataFrame({
        "bid": arr["bid"].astype("float64") / scale,
        "ask": arr["ask"].astype("float64") / scale,
        "bid_volume": arr["bv"].astype("float64"),
        "ask_volume": arr["av"].astype("float64"),
    }, index=pd.DatetimeIndex(ts, tz="UTC", name="ts"))
    return df


def _empty_ticks() -> pd.DataFrame:
    return pd.DataFrame(
        {"bid": [], "ask": [], "bid_volume": [], "ask_volume": []},
        index=pd.DatetimeIndex([], tz="UTC", name="ts"),
    )


def ticks_to_m1(ticks: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Ticks -> velas M1.

    OHLC se arma sobre el BID (la convencion de MT5 para velas). El spread se
    guarda aparte, en PUNTOS, con su promedio y su maximo dentro del minuto.
    Guardar el maximo importa: un spread promedio de 1 pip que llego a 8 durante
    una noticia es informacion sobre riesgo de ejecucion que el promedio borra.
    """
    if len(ticks) == 0:
        return _empty_m1()
    scale = POINT_SCALE.get(symbol, 1e5)
    spread_points = (ticks["ask"] - ticks["bid"]) * scale
    frame = pd.DataFrame({
        "bid": ticks["bid"],
        "spread": spread_points,
        "volume": ticks["bid_volume"] + ticks["ask_volume"],
    })
    g = frame.resample("1min", label="left", closed="left")
    out = pd.DataFrame({
        "open": g["bid"].first(),
        "high": g["bid"].max(),
        "low": g["bid"].min(),
        "close": g["bid"].last(),
        "volume": g["volume"].sum(),
        "spread_mean": g["spread"].mean(),
        "spread_max": g["spread"].max(),
        "ticks": g["bid"].count(),
    })
    return out.dropna(subset=["open"])


def _empty_m1() -> pd.DataFrame:
    cols = ["open", "high", "low", "close", "volume", "spread_mean", "spread_max", "ticks"]
    return pd.DataFrame({c: [] for c in cols},
                        index=pd.DatetimeIndex([], tz="UTC", name="ts"))


def hours_between(start: date, end: date) -> list[datetime]:
    """Horas UTC entre dos fechas, salteando el fin de semana cerrado.

    El mercado FX abre domingo 21:00 UTC (17:00 NY, aproximado sin DST) y cierra
    viernes 21:00 UTC. Se piden las horas del sabado igual: si no existen dan 404,
    que es barato, y si existen no se pierden.
    """
    out: list[datetime] = []
    cur = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
    stop = datetime(end.year, end.month, end.day, tzinfo=timezone.utc) + timedelta(days=1)
    while cur < stop:
        if not (cur.weekday() == 5 and cur.hour < 20):  # sabado hasta las 20 UTC: cerrado
            out.append(cur)
        cur += timedelta(hours=1)
    return out


def _pending_hours(symbol: str, hours: list[datetime], cache_dir: Path) -> tuple[list[datetime], int]:
    """Separa lo que falta de lo que ya esta en disco.

    Retomar una descarga cortada tiene que ser instantaneo: si ya hay 20.000 horas
    en cache, no se vuelven a pedir ni se vuelven a mirar por red.
    """
    pendientes = [h for h in hours if not cache_path(cache_dir, symbol, h).exists()]
    return pendientes, len(hours) - len(pendientes)


def download_range(
    symbol: str, start: date, end: date, cache_dir: Path,
    workers: int = 10, batch_size: int = 60, pause: float = 0.5,
    max_pause: float = 20.0, min_workers: int = 1, progress: bool = True,
) -> tuple[pd.DataFrame, list[HourResult]]:
    """Baja un rango completo y devuelve (M1, informe hora por hora).

    Descarga por TANDAS con control adaptativo de congestion, al estilo TCP: el
    ritmo lo marca el servidor, no un numero elegido a dedo.

    Por que no simplemente abrir muchas conexiones y listo: **Dukascopy castiga la
    concurrencia**. Medido contra el servidor real, mismo momento, mismo rango:

        1 conexion a la vez  -> 65 % de las peticiones responden 200
        8 conexiones a la vez ->  2,5 %

    Con 8 conexiones no se baja ocho veces mas rapido: se baja *menos*, porque casi
    todo vuelve 503 y hay que reintentarlo. Paralelizar de mas es contraproducente
    con esta API. Pero el servidor tambien tiene ratos buenos en los que aguanta
    bastante mas, asi que tampoco conviene fijar la concurrencia en 1.

    Por eso la tanda se autorregula: si vuelve con muchos 503, baja la concurrencia
    a la mitad y agranda la pausa; si vuelve limpia, sube de a poco y aprieta.

    Se puede cortar en cualquier momento (Ctrl+C) y retomar: lo ya bajado queda en
    `cache_dir` y en la corrida siguiente ni se pide.
    """
    todas = hours_between(start, end)
    pendientes, ya_estaban = _pending_hours(symbol, todas, cache_dir)
    if progress:
        print(f"  {symbol}: {len(todas):,} horas en el rango | {ya_estaban:,} ya en cache "
              f"| faltan {len(pendientes):,}", flush=True)

    results: list[HourResult] = []
    espera = pause
    actuales = max(min_workers, min(workers, 8))  # arranca prudente y sube si puede
    t0 = time.time()
    hechas = ok_total = 0

    def work(hour: datetime) -> tuple[datetime, str]:
        _, status = fetch_hour(symbol, hour, cache_dir)
        return hour, status

    for inicio in range(0, len(pendientes), batch_size):
        tanda = pendientes[inicio:inicio + batch_size]
        with ThreadPoolExecutor(max_workers=actuales) as pool:
            salida = list(pool.map(work, tanda))
        results.extend(HourResult(h, 0, st) for h, st in salida)

        buenos = sum(1 for _, st in salida if st in ("ok", "cache", "empty", "http_404"))
        ratio_fallo = 1.0 - buenos / len(salida)
        hechas += len(tanda)
        ok_total += buenos

        antes = actuales
        if ratio_fallo > 0.25:
            actuales = max(min_workers, actuales // 2)
            espera = min(max(espera * 2, 1.0), max_pause)
        elif ratio_fallo < 0.05:
            actuales = min(workers, actuales + 2)
            espera = max(espera / 1.5, pause)

        if progress:
            vel = hechas / max(time.time() - t0, 1e-9)
            eta = (len(pendientes) - hechas) / vel / 60 if vel > 0 else 0
            flecha = "" if actuales == antes else f" -> {actuales}"
            print(f"  {symbol}: {hechas:,}/{len(pendientes):,} | {100*buenos/len(salida):.0f}% ok "
                  f"| {vel:.1f} h/s | conc {antes}{flecha} | pausa {espera:.1f}s "
                  f"| faltan ~{eta:.0f} min", flush=True)

        if inicio + batch_size < len(pendientes):
            time.sleep(espera)

    cacheadas = set(todas) - set(pendientes)
    results.extend(HourResult(h, 0, "cache") for h in cacheadas)
    if progress and pendientes:
        print(f"  {symbol}: tasa de exito de la corrida {100*ok_total/max(hechas,1):.0f}%. "
              f"Volver a correr el mismo comando reintenta solo lo que falto.", flush=True)

    return _build_m1(symbol, todas, cache_dir, results, progress), sorted(
        results, key=lambda r: r.hour
    )


def _build_m1(
    symbol: str, hours: list[datetime], cache_dir: Path,
    results: list[HourResult], progress: bool = True,
) -> pd.DataFrame:
    """Arma el M1 leyendo de la cache. Decodificar es local: no depende de la red."""
    por_hora = {r.hour: r for r in results}
    frames: list[pd.DataFrame] = []
    for hour in hours:
        path = cache_path(cache_dir, symbol, hour)
        if not path.exists():
            continue
        m1 = ticks_to_m1(decode_ticks(path.read_bytes(), symbol, hour), symbol)
        if len(m1):
            frames.append(m1)
            if hour in por_hora:
                por_hora[hour].n_ticks = int(m1["ticks"].sum())
    if progress:
        print(f"  {symbol}: {len(frames):,} horas con datos decodificadas", flush=True)
    if not frames:
        return _empty_m1()
    df = pd.concat(frames).sort_index()
    return df[~df.index.duplicated(keep="first")]
