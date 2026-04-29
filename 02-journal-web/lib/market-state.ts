import { nyParts, isWeekend } from "@/lib/killzones";

// Hora NY, todo en minutos desde 00:00 local NY (DST aware vía Intl).
//
// Killzones:
//   London KZ : 02:00 – 05:00  (120 – 300)
//   NY AM     : 07:00 – 10:00  (420 – 600)
//   NY Lunch  : 11:00 – 12:30  (660 – 750)
//
// Sesiones:
//   London    : 02:00 – 07:00  (120 – 420)
//   NY        : 07:00 – 12:30  (420 – 750)
//
// Fuera de las dos sesiones (12:30 – 02:00 del día siguiente, fines de semana,
// y viernes después de 12:30) el bot está apagado.

export type MarketStateType =
  | "killzone-active"
  | "session-active-no-kz"
  | "session-inactive"
  | "weekend";

export type SessionName = "London" | "NY";
export type KillzoneName = "London KZ" | "NY AM" | "NY Lunch";

type Range = { name: KillzoneName | SessionName; start: number; end: number };

const KILLZONES: { name: KillzoneName; start: number; end: number }[] = [
  { name: "London KZ", start: 120, end: 300 },
  { name: "NY AM", start: 420, end: 600 },
  { name: "NY Lunch", start: 660, end: 750 },
];

const SESSIONS: { name: SessionName; start: number; end: number }[] = [
  { name: "London", start: 120, end: 420 },
  { name: "NY", start: 420, end: 750 },
];

const SESSION_OPEN = 120; // 02:00 NY
const SESSION_CLOSE = 750; // 12:30 NY

export interface Duration {
  hours: number;
  minutes: number;
}

export interface NextKillzoneInfo {
  name: KillzoneName;
  inMinutes: number;
  inHours: number;
}

export interface MarketState {
  state: MarketStateType;
  currentSession?: SessionName;
  currentKillzone?: KillzoneName;
  nextKillzone?: NextKillzoneInfo;
  closesIn?: Duration;
  opensIn?: Duration;
}

export function getMarketState(now: Date = new Date()): MarketState {
  const { weekday, totalMin } = nyParts(now);

  if (isMarketWeekend(weekday, totalMin)) {
    return { state: "weekend" };
  }

  const kz = KILLZONES.find((k) => totalMin >= k.start && totalMin < k.end);
  if (kz) {
    const session = sessionFor(totalMin);
    return {
      state: "killzone-active",
      currentSession: session,
      currentKillzone: kz.name,
      closesIn: minutesToDuration(kz.end - totalMin),
    };
  }

  const session = sessionFor(totalMin);
  if (session) {
    const next = nextKillzoneFromMinute(totalMin, weekday);
    return {
      state: "session-active-no-kz",
      currentSession: session,
      ...(next ? { nextKillzone: next } : {}),
    };
  }

  // session-inactive (weekday off-hours)
  const minutesUntilOpen = minutesUntilNextSessionOpen(totalMin);
  return {
    state: "session-inactive",
    opensIn: minutesToDuration(minutesUntilOpen),
    nextKillzone: {
      name: "London KZ",
      inMinutes: minutesUntilOpen,
      inHours: Math.round((minutesUntilOpen / 60) * 10) / 10,
    },
  };
}

function isMarketWeekend(weekday: string, totalMin: number): boolean {
  if (isWeekend(weekday)) return true;
  // Domingo entero ya cubierto por isWeekend.
  // Viernes: si pasó la 12:30 NY, el bot ya no opera hasta el lunes.
  if (weekday === "Fri" && totalMin >= SESSION_CLOSE) return true;
  return false;
}

function sessionFor(totalMin: number): SessionName | undefined {
  return SESSIONS.find((s) => totalMin >= s.start && totalMin < s.end)?.name;
}

function nextKillzoneFromMinute(
  totalMin: number,
  weekday: string,
): NextKillzoneInfo | undefined {
  // Buscar la siguiente killzone hoy.
  const upcoming = KILLZONES.find((k) => k.start > totalMin);
  if (upcoming) {
    const mins = upcoming.start - totalMin;
    return {
      name: upcoming.name,
      inMinutes: mins,
      inHours: Math.round((mins / 60) * 10) / 10,
    };
  }
  // Si ya pasaron todas hoy, la próxima es London KZ del próximo día válido.
  void weekday;
  const mins = minutesUntilNextSessionOpen(totalMin);
  return {
    name: "London KZ",
    inMinutes: mins,
    inHours: Math.round((mins / 60) * 10) / 10,
  };
}

function minutesUntilNextSessionOpen(totalMin: number): number {
  if (totalMin < SESSION_OPEN) return SESSION_OPEN - totalMin;
  // Ya pasó la apertura de hoy (o estamos después del cierre); la siguiente es 02:00 mañana.
  return 1440 - totalMin + SESSION_OPEN;
}

export function minutesToDuration(min: number): Duration {
  const m = Math.max(0, Math.round(min));
  return { hours: Math.floor(m / 60), minutes: m % 60 };
}

export function formatDuration(d: Duration): string {
  if (d.hours > 0 && d.minutes > 0) return `${d.hours}h ${d.minutes}m`;
  if (d.hours > 0) return `${d.hours}h`;
  return `${d.minutes}m`;
}
