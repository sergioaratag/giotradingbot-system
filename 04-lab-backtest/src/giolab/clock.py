"""Reloj y sesiones. El antidoto al bug del offset fijo UTC-4.

Regla del laboratorio:
  - En almacenamiento y en el motor, TODO es UTC timezone-aware.
  - La hora de Nueva York aparece SOLO aca, y siempre via zoneinfo.
  - Jamas un offset fijo. Nueva York es UTC-5 en invierno y UTC-4 en verano,
    y las fechas de cambio se mueven todos los anos.

El sistema anterior tenia UTC-4 hardcodeado (Liquidity.mqh:480-483). De noviembre
a marzo el bot corria TODAS sus ventanas una hora fuera de lugar: killzones,
reset diario, cierre del viernes. Cuatro o cinco meses por ano operando en el
horario equivocado.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .types import Session

UTC = timezone.utc
NY = ZoneInfo("America/New_York")
LONDON_TZ = ZoneInfo("Europe/London")

# Ventanas de sesion en hora local de Nueva York (inicio inclusive, fin exclusivo).
# Londres abre 3:00 NY, NY abre 8:00, el solape va de 8:00 a 11:30, Asia 19:00-3:00.
SESSION_WINDOWS: tuple[tuple[Session, time, time], ...] = (
    (Session.LONDON, time(3, 0), time(8, 0)),
    (Session.OVERLAP, time(8, 0), time(11, 30)),
    (Session.NEW_YORK, time(11, 30), time(17, 0)),
    (Session.ASIA, time(19, 0), time(3, 0)),  # cruza medianoche
)


def ensure_utc(ts: datetime) -> datetime:
    """Rechaza timestamps naive. Un naive es una bomba de tiempo silenciosa."""
    if ts.tzinfo is None:
        raise ValueError(
            f"Timestamp naive: {ts!r}. Todo timestamp en el lab debe ser UTC aware."
        )
    return ts.astimezone(UTC)


def to_ny(ts: datetime) -> datetime:
    """UTC -> hora de Nueva York, con DST real."""
    return ensure_utc(ts).astimezone(NY)


def ny_offset_hours(ts: datetime) -> float:
    """Offset de NY respecto a UTC en esa fecha. -5 en invierno, -4 en verano."""
    off = to_ny(ts).utcoffset()
    assert off is not None
    return off.total_seconds() / 3600.0


def is_ny_dst(ts: datetime) -> bool:
    dst = to_ny(ts).dst()
    return bool(dst and dst.total_seconds() != 0)


def ny_time_at(ts: datetime) -> time:
    return to_ny(ts).time()


def ny_date_at(ts: datetime) -> date:
    return to_ny(ts).date()


def _in_window(t: time, start: time, end: time) -> bool:
    if start <= end:
        return start <= t < end
    return t >= start or t < end  # ventana que cruza medianoche


def session_of(ts: datetime) -> Session:
    """Sesion a la que pertenece un instante, en hora NY con DST real."""
    ny = to_ny(ts)
    if ny.weekday() >= 5:  # sabado/domingo: mercado cerrado o casi
        if ny.weekday() == 6 and ny.time() >= time(17, 0):
            pass  # domingo 17:00 NY abre el mercado
        else:
            return Session.OFF
    t = ny.time()
    for name, start, end in SESSION_WINDOWS:
        if _in_window(t, start, end):
            return name
    return Session.OFF


def ny_session_day(ts: datetime) -> date:
    """Dia de trading segun el rollover de las 17:00 NY.

    El mercado FX corre de domingo 17:00 NY a viernes 17:00 NY. Todo lo que pasa
    despues de las 17:00 pertenece al dia de trading SIGUIENTE. Contar el drawdown
    diario por fecha calendario en vez de por esto es como una prop firm mide mal.
    """
    ny = to_ny(ts)
    d = ny.date()
    if ny.time() >= time(17, 0):
        d = d + timedelta(days=1)
    return d


def is_rollover(prev_ts: datetime, ts: datetime) -> bool:
    """True si entre prev_ts y ts se cruzo el rollover de las 17:00 NY."""
    return ny_session_day(prev_ts) != ny_session_day(ts)


def swap_multiplier(ts: datetime) -> float:
    """Multiplicador de swap al cruzar el rollover.

    El miercoles se cobra triple porque cubre el fin de semana (T+2).
    Se mira el dia NY en que ARRANCA el rollover.
    """
    ny = to_ny(ts - timedelta(minutes=1))
    return 3.0 if ny.weekday() == 2 else 1.0


def ny_datetime(y: int, m: int, d: int, hh: int = 0, mm: int = 0) -> datetime:
    """Construye un instante desde hora local NY y lo devuelve en UTC.

    Util para tests y para configurar ventanas: se piensa en hora NY, se
    almacena en UTC.
    """
    return datetime(y, m, d, hh, mm, tzinfo=NY).astimezone(UTC)
