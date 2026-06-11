// Killzones ICT en hora de Nueva York (America/New_York).
// London KZ : 02:00 – 05:00 NY
// NY AM     : 07:00 – 10:00 NY
// NY Lunch  : 11:00 – 12:30 NY (zona de reversión, válida para el bot)

export type Killzone = {
  id: "LDN" | "NY_AM" | "NY_LUNCH";
  label: string;
  startMin: number; // minutos desde 00:00 NY
  endMin: number;
};

export const KILLZONES: Killzone[] = [
  { id: "LDN", label: "London", startMin: 2 * 60, endMin: 5 * 60 },
  { id: "NY_AM", label: "NY AM", startMin: 7 * 60, endMin: 10 * 60 },
  { id: "NY_LUNCH", label: "NY Lunch", startMin: 11 * 60, endMin: 12 * 60 + 30 },
];

export function nyParts(date: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday"); // "Mon" ...
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const second = parseInt(get("second"), 10);
  return { weekday, hour, minute, second, totalMin: hour * 60 + minute };
}

export function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

export function activeKillzone(date: Date = new Date()): Killzone | null {
  const { weekday, totalMin } = nyParts(date);
  if (isWeekend(weekday)) return null;
  return (
    KILLZONES.find((kz) => totalMin >= kz.startMin && totalMin < kz.endMin) ??
    null
  );
}

export function nextKillzone(date: Date = new Date()): {
  zone: Killzone;
  minutesUntil: number;
} | null {
  const { weekday, totalMin } = nyParts(date);
  if (isWeekend(weekday)) {
    // Próxima killzone es London el lunes 02:00 NY — calcular días hasta lunes
    const daysToMon = weekday === "Sat" ? 2 : 1;
    return {
      zone: KILLZONES[0],
      minutesUntil: daysToMon * 24 * 60 + KILLZONES[0].startMin - totalMin,
    };
  }
  const upcoming = KILLZONES.find((kz) => kz.startMin > totalMin);
  if (upcoming) {
    return { zone: upcoming, minutesUntil: upcoming.startMin - totalMin };
  }
  // Después de NY PM, próxima es London del día siguiente
  const isFriday = weekday === "Fri";
  const daysAdd = isFriday ? 3 : 1;
  return {
    zone: KILLZONES[0],
    minutesUntil: daysAdd * 24 * 60 + KILLZONES[0].startMin - totalMin,
  };
}

export function formatHM(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Mapea el nombre de killzone que manda el bot al id de KILLZONES.
function botKzToId(name: string | null | undefined): Killzone["id"] | null {
  switch (name) {
    case "LONDON_KZ":
      return "LDN";
    case "NY_AM":
      return "NY_AM";
    case "NY_LUNCH":
      return "NY_LUNCH";
    default:
      return null;
  }
}

// Fase 6 — Ventana [start,end] en segundos Unix de la killzone del día de
// `refUnixSec`, para pintar la banda de fondo en el chart. Relativo a la hora NY
// actual, así que es DST-correcto (1 min NY = 1 min real salvo en la transición).
export function killzoneWindowUnix(
  name: string | null | undefined,
  refUnixSec: number,
): { start: number; end: number } | null {
  const id = botKzToId(name);
  if (!id) return null;
  const kz = KILLZONES.find((k) => k.id === id);
  if (!kz) return null;
  const { totalMin } = nyParts(new Date(refUnixSec * 1000));
  return {
    start: refUnixSec + (kz.startMin - totalMin) * 60,
    end: refUnixSec + (kz.endMin - totalMin) * 60,
  };
}

// Feature 1 (6B): colores de cada killzone para las bandas del chart.
export const KILLZONE_COLORS: Record<Killzone["id"], { fill: string; stroke: string }> = {
  LDN: { fill: "rgba(96,165,250,0.07)", stroke: "rgba(96,165,250,0.32)" }, // azul/celeste
  NY_AM: { fill: "rgba(248,113,113,0.07)", stroke: "rgba(248,113,113,0.32)" }, // rosa/rojo claro
  NY_LUNCH: { fill: "rgba(140,140,150,0.08)", stroke: "rgba(140,140,150,0.32)" }, // gris
};

// Ventana [start,end] en segundos Unix de una killzone para el día del `anchor`.
function windowForKz(kz: Killzone, anchorUnix: number): { start: number; end: number } {
  const { totalMin } = nyParts(new Date(anchorUnix * 1000));
  return {
    start: anchorUnix + (kz.startMin - totalMin) * 60,
    end: anchorUnix + (kz.endMin - totalMin) * 60,
  };
}

export type KillzoneBand = {
  id: Killzone["id"];
  label: string;
  color: { fill: string; stroke: string };
  start: number;
  end: number;
};

// Todas las ocurrencias de killzones que solapan el rango visible [from,to]
// (en segundos Unix). Sirve para pintar las bandas en TODOS los timeframes.
export function killzoneWindowsForRange(fromUnix: number, toUnix: number): KillzoneBand[] {
  const DAY = 86400;
  const out: KillzoneBand[] = [];
  // Anclar a mediodía UTC de cada día (cae dentro del mismo día NY que las KZ).
  for (let t = Math.floor(fromUnix / DAY) * DAY - DAY + 12 * 3600; t <= toUnix + DAY; t += DAY) {
    for (const kz of KILLZONES) {
      const w = windowForKz(kz, t);
      if (w.end >= fromUnix && w.start <= toUnix) {
        out.push({ id: kz.id, label: kz.label, color: KILLZONE_COLORS[kz.id], start: w.start, end: w.end });
      }
    }
  }
  return out;
}

export function killzoneLabelEs(name: string | null | undefined): string {
  switch (name) {
    case "LONDON_KZ":
      return "Killzone Londres";
    case "NY_AM":
      return "Killzone NY AM";
    case "NY_LUNCH":
      return "Killzone NY Lunch";
    case "SESSION_NO_KZ":
      return "En sesión (fuera de killzone)";
    default:
      return "Fuera de killzone";
  }
}

export function formatNYClock(date: Date = new Date()): string {
  const { hour, minute, second } = nyParts(date);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)} NY`;
}
