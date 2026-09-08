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
    retries: int = 3, timeout: float = 30.0,
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
        time.sleep(0.6 * (2 ** attempt))  # backoff exponencial
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


def download_range(
    symbol: str, start: date, end: date, cache_dir: Path,
    workers: int = 12, progress: bool = True,
) -> tuple[pd.DataFrame, list[HourResult]]:
    """Baja un rango completo y devuelve (M1, informe hora por hora).

    El informe es tan importante como los datos: dice exactamente que horas
    faltan y por que. Un backtest sobre datos con huecos que nadie conto es
    un backtest sobre datos inventados.
    """
    hours = hours_between(start, end)
    results: list[HourResult] = []
    frames: list[pd.DataFrame] = []
    done = 0

    def work(hour: datetime) -> tuple[datetime, pd.DataFrame, str]:
        raw, status = fetch_hour(symbol, hour, cache_dir)
        if raw is None:
            return hour, _empty_m1(), status
        ticks = decode_ticks(raw, symbol, hour)
        return hour, ticks_to_m1(ticks, symbol), ("ok" if len(ticks) else "empty")

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(work, h): h for h in hours}
        for fut in as_completed(futures):
            hour, m1, status = fut.result()
            n_ticks = int(m1["ticks"].sum()) if len(m1) else 0
            results.append(HourResult(hour, n_ticks, status))
            if len(m1):
                frames.append(m1)
            done += 1
            if progress and done % 500 == 0:
                print(f"  {symbol}: {done}/{len(hours)} horas", flush=True)

    if not frames:
        return _empty_m1(), sorted(results, key=lambda r: r.hour)
    df = pd.concat(frames).sort_index()
    df = df[~df.index.duplicated(keep="first")]
    return df, sorted(results, key=lambda r: r.hour)
