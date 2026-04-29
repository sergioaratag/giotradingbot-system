import { XMLParser } from "fast-xml-parser";
import { nyWallToUTC } from "@/lib/ny-time";

export type FFImpact = "High" | "Medium" | "Low";

export interface FFEvent {
  title: string;
  country: string;
  currency: string;
  impact: FFImpact;
  scheduledAt: Date;
  actual?: string;
  forecast?: string;
  previous?: string;
}

export const RELEVANT_CURRENCIES = ["EUR", "USD", "GBP", "JPY"] as const;

const FF_DEFAULT_URL =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";

export async function fetchForexFactoryWeek(): Promise<FFEvent[]> {
  const url = process.env.FOREXFACTORY_XML_URL || FF_DEFAULT_URL;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`FF fetch failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  return parseForexFactoryXml(xml);
}

export function parseForexFactoryXml(xml: string): FFEvent[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: "__cdata",
    parseTagValue: false,
    trimValues: true,
  });
  const data = parser.parse(xml) as {
    weeklyevents?: { event?: RawEvent | RawEvent[] };
  };

  const raw = data.weeklyevents?.event;
  const events: RawEvent[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const out: FFEvent[] = [];
  for (const e of events) {
    const impact = normalizeImpact(text(e.impact));
    if (!impact) continue;

    const dateStr = text(e.date);
    const timeStr = text(e.time);
    const scheduledAt = parseFFDateTime(dateStr, timeStr);
    if (!scheduledAt) continue;

    const country = text(e.country);
    if (!country) continue;

    out.push({
      title: text(e.title) || "Untitled",
      country,
      currency: country,
      impact,
      scheduledAt,
      actual: text(e.actual) || undefined,
      forecast: text(e.forecast) || undefined,
      previous: text(e.previous) || undefined,
    });
  }
  return out;
}

type RawEvent = {
  title?: string | { __cdata?: string };
  country?: string | { __cdata?: string };
  date?: string | { __cdata?: string };
  time?: string | { __cdata?: string };
  impact?: string | { __cdata?: string };
  actual?: string | { __cdata?: string } | null;
  forecast?: string | { __cdata?: string } | null;
  previous?: string | { __cdata?: string } | null;
};

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v !== null && "__cdata" in v) {
    const c = (v as { __cdata?: unknown }).__cdata;
    return typeof c === "string" ? c.trim() : "";
  }
  return "";
}

export function normalizeImpact(raw: string): FFImpact | null {
  const v = raw.toLowerCase();
  if (v === "high") return "High";
  if (v === "medium") return "Medium";
  if (v === "low") return "Low";
  return null; // "Holiday", "Non-Economic", or unknown
}

// Parse FF date "MM-DD-YYYY" + time "8:00pm" / "12:30am" (NY local time / Eastern)
// Returns a UTC Date, or null if time is "All Day"/"Tentative"/empty.
export function parseFFDateTime(
  dateStr: string,
  timeStr: string,
): Date | null {
  if (!dateStr) return null;
  const dm = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!dm) return null;
  const month = parseInt(dm[1], 10);
  const day = parseInt(dm[2], 10);
  const year = parseInt(dm[3], 10);

  if (!timeStr) return null;
  const t = timeStr.toLowerCase().trim();
  if (t === "all day" || t === "tentative" || t === "tbd") return null;

  const tm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!tm) return null;
  let hour = parseInt(tm[1], 10);
  const minute = parseInt(tm[2], 10);
  const ampm = tm[3];
  if (ampm === "am") {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  return nyWallToUTC(year, month, day, hour, minute);
}
