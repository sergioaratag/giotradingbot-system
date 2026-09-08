"""Descarga de M1 desde HistData.com. Respaldo de Dukascopy.

Ventaja: un ZIP por mes en vez de un archivo por hora. Bajar tres años son 36
descargas en vez de 26.000.

Desventaja grande: NO trae spread. HistData publica un solo precio por vela, sin
bid ni ask. Con estos datos el spread hay que estimarlo con el perfil por sesion
de CostConfig, y los costos pasan de medidos a supuestos.

TRAMPA DE ZONA HORARIA — leer antes de tocar nada:
  HistData publica sus timestamps en "EST sin ajuste de horario de verano", es
  decir un offset FIJO de UTC-5 los 365 dias del año. NO es America/New_York.
  Interpretarlo con zoneinfo("America/New_York") corre los datos una hora durante
  todo el verano. Por eso aca se usa timezone(timedelta(hours=-5)) a proposito:
  es el unico lugar del laboratorio donde un offset fijo es la respuesta correcta,
  porque describe como esta publicado el archivo, no una zona horaria real.
  Se convierte a UTC de inmediato y se guarda en UTC.
"""

from __future__ import annotations

import io
import re
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

BASE = "https://www.histdata.com"
PAGE = BASE + "/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/{pair}/{year}/{month}"
GET = BASE + "/get.php"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) giolab-backtest/1.0"

# El offset fijo con el que HistData publica. No es una zona horaria: es un formato.
HISTDATA_TZ = timezone(timedelta(hours=-5), name="EST-fijo-histdata")


def _get(url: str, referer: str | None = None, data: bytes | None = None) -> bytes:
    headers = {"User-Agent": UA, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def download_month(pair: str, year: int, month: int, cache_dir: Path) -> bytes | None:
    """Baja el ZIP de un mes. HistData exige un token del formulario y un Referer."""
    pair_l = pair.lower()
    cached = Path(cache_dir) / "histdata" / f"{pair_l}_{year}{month:02d}.zip"
    if cached.exists():
        return cached.read_bytes()

    page_url = PAGE.format(pair=pair_l, year=year, month=month)
    html = _get(page_url).decode("utf-8", "ignore")
    m = re.search(r'id="tk"\s+value="([^"]+)"', html)
    if not m:
        return None
    payload = urllib.parse.urlencode({
        "tk": m.group(1), "date": str(year), "datemonth": f"{year}{month:02d}",
        "platform": "ASCII", "timeframe": "M1", "fxpair": pair.upper(),
    }).encode()
    blob = _get(GET, referer=page_url, data=payload)
    if not blob.startswith(b"PK"):
        return None
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(blob)
    return blob


def parse_zip(blob: bytes) -> pd.DataFrame:
    """CSV de HistData -> M1 en UTC.

    Formato: AAAAMMDD HHMMSS;open;high;low;close;volume  (punto y coma, sin cabecera)
    """
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        raw = zf.read(name)
    df = pd.read_csv(
        io.BytesIO(raw), sep=";", header=None,
        names=["ts", "open", "high", "low", "close", "volume"],
    )
    naive = pd.to_datetime(df["ts"], format="%Y%m%d %H%M%S")
    # Se declara el offset con el que viene publicado y se pasa a UTC en un solo paso.
    df.index = naive.dt.tz_localize(HISTDATA_TZ).dt.tz_convert("UTC")
    df.index.name = "ts"
    out = df[["open", "high", "low", "close", "volume"]].copy()
    out["spread_mean"] = 0.0   # HistData no publica spread. Cero = "no hay dato".
    out["spread_max"] = 0.0
    out["ticks"] = 0
    return out.sort_index()


def download_range(
    pair: str, start_year: int, start_month: int, end_year: int, end_month: int,
    cache_dir: Path, progress: bool = True,
) -> tuple[pd.DataFrame, list[dict]]:
    frames, report = [], []
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        try:
            blob = download_month(pair, y, m, cache_dir)
            if blob is None:
                report.append({"year": y, "month": m, "status": "no_disponible", "bars": 0})
            else:
                df = parse_zip(blob)
                frames.append(df)
                report.append({"year": y, "month": m, "status": "ok", "bars": len(df)})
        except Exception as e:
            report.append({"year": y, "month": m, "status": f"error: {type(e).__name__}", "bars": 0})
        if progress:
            print(f"  {pair} {y}-{m:02d}: {report[-1]['status']} ({report[-1]['bars']:,})", flush=True)
        m += 1
        if m > 12:
            y, m = y + 1, 1
    if not frames:
        return pd.DataFrame(), report
    df = pd.concat(frames).sort_index()
    return df[~df.index.duplicated(keep="first")], report
