// Convert wall-clock components in America/New_York to a UTC Date,
// accounting for EDT/EST DST transitions.
export function nyWallToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(asUtc));
  const obj: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") obj[p.type] = p.value;
  const nyHour = parseInt(obj.hour, 10) % 24;
  const nyMillis = Date.UTC(
    parseInt(obj.year, 10),
    parseInt(obj.month, 10) - 1,
    parseInt(obj.day, 10),
    nyHour,
    parseInt(obj.minute, 10),
  );
  const offsetMs = asUtc - nyMillis;
  return new Date(asUtc + offsetMs);
}

// YYYY/MM/DD numeric components for the NY local date of a given UTC instant.
export function nyDateParts(date: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = fmt.format(date); // YYYY-MM-DD
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return { year: y, month: m, day: d };
}

export function nyDayBoundsUtc(date: Date = new Date()) {
  const { year, month, day } = nyDateParts(date);
  return {
    startUtc: nyWallToUTC(year, month, day, 0, 0),
    endUtc: nyWallToUTC(year, month, day, 23, 59),
    year,
    month,
    day,
  };
}
