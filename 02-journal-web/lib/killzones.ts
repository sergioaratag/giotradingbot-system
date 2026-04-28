// Killzones ICT en hora de Nueva York (America/New_York)
// London Open: 02:00-05:00 NY
// NY AM: 08:30-11:00 NY
// NY PM: 13:30-16:00 NY

export type Killzone = {
  id: "LDN" | "NY_AM" | "NY_PM";
  label: string;
  startMin: number; // minutos desde 00:00 NY
  endMin: number;
};

export const KILLZONES: Killzone[] = [
  { id: "LDN", label: "London", startMin: 2 * 60, endMin: 5 * 60 },
  { id: "NY_AM", label: "NY AM", startMin: 8 * 60 + 30, endMin: 11 * 60 },
  { id: "NY_PM", label: "NY PM", startMin: 13 * 60 + 30, endMin: 16 * 60 },
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

export function formatNYClock(date: Date = new Date()): string {
  const { hour, minute, second } = nyParts(date);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)} NY`;
}
