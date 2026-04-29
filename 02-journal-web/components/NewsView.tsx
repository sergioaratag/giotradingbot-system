"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { NewsImpact } from "@prisma/client";
import { BLOCK_CURRENCIES, BLOCK_WINDOW_MIN } from "@/lib/news";
import { nyDateParts, nyWallToUTC } from "@/lib/ny-time";
import { playSound } from "@/lib/sounds";

type NewsEvt = {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: NewsImpact;
  scheduledAt: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  isBlocked: boolean;
};

const ALL_CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;
const ALL_IMPACTS: NewsImpact[] = ["HIGH", "MEDIUM", "LOW"];
const IMPACT_LABEL: Record<NewsImpact, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};
const IMPACT_COLOR: Record<NewsImpact, string> = {
  HIGH: "var(--color-rose)",
  MEDIUM: "var(--color-violet)",
  LOW: "var(--color-dust)",
};

const WEEKDAY_LABEL_NY = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_LABEL = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function NewsView() {
  const [events, setEvents] = useState<NewsEvt[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [currencies, setCurrencies] = useState<Set<string>>(
    new Set(ALL_CURRENCIES),
  );
  const [impacts, setImpacts] = useState<Set<NewsImpact>>(
    new Set(["HIGH", "MEDIUM"]),
  );

  // tick clock for countdowns
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const weekDays = useMemo(() => buildWeekDays(now ?? new Date()), [now]);

  const range = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    if (!first || !last) return null;
    const from = nyWallToUTC(first.year, first.month, first.day, 0, 0);
    const to = nyWallToUTC(last.year, last.month, last.day, 23, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [weekDays]);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
    });
    const res = await fetch(`/api/news?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/news/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Sync failed");
      playSound("success");
      setSyncMsg(`Sync OK · ${data.created} nuevas, ${data.updated} actualizadas`);
      await load();
    } catch (err) {
      setSyncMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    return events.filter(
      (e) => currencies.has(e.currency) && impacts.has(e.impact),
    );
  }, [events, currencies, impacts]);

  const today = useMemo(() => {
    if (!now) return null;
    return getNyKey(now);
  }, [now]);

  const todayEvents = useMemo(() => {
    if (!today) return [];
    return filtered.filter((e) => getNyKey(new Date(e.scheduledAt)) === today);
  }, [filtered, today]);

  const nextEvent = useMemo(() => {
    if (!now) return null;
    const t = now.getTime();
    return (
      events
        .filter((e) => new Date(e.scheduledAt).getTime() > t)
        .sort(
          (a, b) =>
            new Date(a.scheduledAt).getTime() -
            new Date(b.scheduledAt).getTime(),
        )[0] ?? null
    );
  }, [events, now]);

  const activeBlock = useMemo(() => {
    if (!now) return null;
    const t = now.getTime();
    return (
      events.find((e) => {
        if (e.impact !== "HIGH") return false;
        if (!(BLOCK_CURRENCIES as readonly string[]).includes(e.currency))
          return false;
        const sched = new Date(e.scheduledAt).getTime();
        return (
          t >= sched - BLOCK_WINDOW_MIN * 60_000 &&
          t <= sched + BLOCK_WINDOW_MIN * 60_000
        );
      }) ?? null
    );
  }, [events, now]);

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-cream"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "2rem",
              letterSpacing: "-0.01em",
            }}
          >
            Noticias económicas
          </h1>
          <p
            data-secondary="true"
            className="text-xs text-mute mt-1"
            style={{ letterSpacing: "0.04em" }}
          >
            Calendario ForexFactory · Bot bloquea trades 30 min antes/después de
            noticias HIGH
          </p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-mute">{syncMsg}</span>
          )}
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "var(--color-rose)",
              color: "var(--color-onyx)",
              letterSpacing: "0.18em",
            }}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              strokeWidth={2}
            />
            {syncing ? "Sincronizando…" : "Actualizar"}
          </button>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-3"
        data-secondary="true"
      >
        <FilterGroup label="Moneda">
          {ALL_CURRENCIES.map((c) => (
            <FilterChip
              key={c}
              active={currencies.has(c)}
              onClick={() => toggle(setCurrencies, currencies, c)}
            >
              {c}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Impacto">
          {ALL_IMPACTS.map((i) => (
            <FilterChip
              key={i}
              active={impacts.has(i)}
              color={IMPACT_COLOR[i]}
              onClick={() => toggle(setImpacts, impacts, i)}
            >
              {IMPACT_LABEL[i]}
            </FilterChip>
          ))}
        </FilterGroup>
      </div>

      <TodayPanel
        now={now}
        todayEvents={todayEvents}
        nextEvent={nextEvent}
        activeBlock={activeBlock}
      />

      <div className="mt-6 grid grid-cols-7 gap-3">
        {weekDays.map((d) => {
          const key = `${d.year}-${pad(d.month)}-${pad(d.day)}`;
          const dayEvents = filtered.filter(
            (e) => getNyKey(new Date(e.scheduledAt)) === key,
          );
          const isToday = today === key;
          return (
            <DayColumn
              key={key}
              day={d}
              events={dayEvents}
              isToday={isToday}
              now={now}
            />
          );
        })}
      </div>

      {loading && (
        <p className="mt-4 text-xs text-mute">Cargando noticias…</p>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-mute uppercase"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] uppercase px-2 py-1 transition-colors rounded-sm"
      style={{
        letterSpacing: "0.14em",
        background: active ? "rgba(199,119,151,0.10)" : "var(--color-coal)",
        color: active ? color ?? "var(--color-rose)" : "var(--color-dust)",
        border: `0.5px solid ${
          active ? color ?? "var(--color-rose)" : "var(--color-graphite)"
        }`,
      }}
    >
      {children}
    </button>
  );
}

function toggle<T>(
  setter: React.Dispatch<React.SetStateAction<Set<T>>>,
  current: Set<T>,
  value: T,
) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
}

function TodayPanel({
  now,
  todayEvents,
  nextEvent,
  activeBlock,
}: {
  now: Date | null;
  todayEvents: NewsEvt[];
  nextEvent: NewsEvt | null;
  activeBlock: NewsEvt | null;
}) {
  if (!now) return null;
  const today = nyDateParts(now);
  const dayWeekIdx = new Date(now).getDay();
  const dayLabel = `${WEEKDAY_LABEL_NY[dayWeekIdx]} ${today.day} ${MONTH_LABEL[today.month - 1]}`;

  return (
    <div
      className="mt-6 bg-coal p-4 flex flex-col gap-3"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div
            className="text-[10px] text-mute uppercase"
            style={{ letterSpacing: "0.22em" }}
          >
            Hoy · {dayLabel}
          </div>
          <div
            className="text-cream mt-0.5"
            style={{ fontFamily: "var(--font-fraunces), serif", fontSize: "1.1rem" }}
          >
            {todayEvents.length === 0
              ? "Sin noticias filtradas hoy"
              : `${todayEvents.length} noticia${todayEvents.length === 1 ? "" : "s"} programada${todayEvents.length === 1 ? "" : "s"}`}
          </div>
        </div>
        {nextEvent && (
          <NextCountdown now={now} evt={nextEvent} />
        )}
      </div>

      {activeBlock && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: "rgba(199, 119, 151, 0.08)",
            border: "0.5px solid rgba(199, 119, 151, 0.35)",
          }}
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0"
            strokeWidth={1.8}
            style={{ color: "var(--color-rose)" }}
          />
          <p className="text-xs text-cream-muted">
            Bot bloqueado por{" "}
            <span className="text-cream font-medium">{activeBlock.title}</span>{" "}
            hasta{" "}
            <span className="font-mono text-rose">
              {fmtNyHM(
                new Date(
                  new Date(activeBlock.scheduledAt).getTime() +
                    BLOCK_WINDOW_MIN * 60_000,
                ),
              )}{" "}
              NY
            </span>
          </p>
        </div>
      )}

      {todayEvents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {todayEvents.map((e) => (
            <CompactBadge key={e.id} evt={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function NextCountdown({ now, evt }: { now: Date; evt: NewsEvt }) {
  const diffMs = new Date(evt.scheduledAt).getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const totalMin = Math.floor(diffMs / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return (
    <div className="text-right">
      <div
        className="text-[10px] text-mute uppercase"
        style={{ letterSpacing: "0.22em" }}
      >
        Próxima
      </div>
      <div className="text-sm text-cream mt-0.5">
        {evt.title}{" "}
        <span
          className="ml-2 font-mono text-rose"
          style={{ letterSpacing: "0.06em" }}
        >
          en {h > 0 ? `${h}h ` : ""}
          {m}m
        </span>
      </div>
    </div>
  );
}

function CompactBadge({ evt }: { evt: NewsEvt }) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5"
      style={{
        background: "var(--color-onyx)",
        border: "0.5px solid var(--color-graphite)",
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: IMPACT_COLOR[evt.impact] }}
      />
      <span
        className="font-mono text-[11px] text-cream-muted tabular-nums"
        style={{ letterSpacing: "0.04em" }}
      >
        {fmtNyHM(new Date(evt.scheduledAt))}
      </span>
      <span
        className="text-[10px] uppercase"
        style={{
          letterSpacing: "0.14em",
          color: IMPACT_COLOR[evt.impact],
        }}
      >
        {evt.currency}
      </span>
      <span className="text-xs text-cream truncate max-w-[180px]">
        {evt.title}
      </span>
    </div>
  );
}

function DayColumn({
  day,
  events,
  isToday,
  now,
}: {
  day: WeekDay;
  events: NewsEvt[];
  isToday: boolean;
  now: Date | null;
}) {
  const dayLabelIdx = new Date(
    nyWallToUTC(day.year, day.month, day.day, 12, 0),
  ).getUTCDay();
  return (
    <div
      className="bg-coal flex flex-col min-h-[260px]"
      style={{
        border: `0.5px solid ${
          isToday ? "var(--color-rose)" : "var(--color-graphite)"
        }`,
      }}
    >
      <div
        className="px-2 py-2 text-center"
        style={{
          borderBottom: "0.5px solid var(--color-graphite)",
          background: isToday ? "rgba(199,119,151,0.06)" : "transparent",
        }}
      >
        <div
          className="font-mono text-[10px] uppercase"
          style={{
            letterSpacing: "0.22em",
            color: isToday ? "var(--color-rose)" : "var(--color-mute)",
          }}
        >
          {WEEKDAY_LABEL_NY[dayLabelIdx]}
        </div>
        <div
          className="text-cream-muted text-xs mt-0.5"
          style={{ letterSpacing: "0.04em" }}
        >
          {pad(day.day)} {MONTH_LABEL[day.month - 1]}
        </div>
      </div>

      <div className="flex-1 p-2 space-y-2">
        {events.length === 0 && (
          <div className="text-[11px] text-mute text-center py-4">—</div>
        )}
        {events.map((e) => (
          <EventCard key={e.id} evt={e} now={now} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ evt, now }: { evt: NewsEvt; now: Date | null }) {
  const sched = new Date(evt.scheduledAt);
  const isHigh = evt.impact === "HIGH";
  const isMajor = (BLOCK_CURRENCIES as readonly string[]).includes(evt.currency);
  const showBlockBand = isHigh && isMajor;
  const inBlockNow =
    showBlockBand &&
    now &&
    Math.abs(now.getTime() - sched.getTime()) <= BLOCK_WINDOW_MIN * 60_000;

  return (
    <div
      className="relative px-2 py-2"
      style={{
        background: "var(--color-onyx)",
        border: "0.5px solid var(--color-graphite)",
      }}
    >
      {showBlockBand && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0"
          style={{
            width: "3px",
            background: "rgba(199, 119, 151, 0.45)",
          }}
          title="Ventana de bloqueo del bot"
        />
      )}

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
          style={{ background: IMPACT_COLOR[evt.impact] }}
        />
        <span
          className="font-mono text-[11px] text-cream tabular-nums"
          style={{ letterSpacing: "0.04em" }}
        >
          {fmtNyHM(sched)}
        </span>
        <span
          className="ml-auto text-[10px] uppercase"
          style={{
            letterSpacing: "0.14em",
            color: IMPACT_COLOR[evt.impact],
          }}
        >
          {evt.currency}
        </span>
      </div>

      <p className="mt-1 text-cream text-xs leading-snug">{evt.title}</p>

      {(evt.actual || evt.forecast || evt.previous) && (
        <div
          className="mt-2 grid grid-cols-3 gap-1 text-[10px]"
          style={{ letterSpacing: "0.06em" }}
        >
          <Stat label="Act" value={evt.actual} accent />
          <Stat label="Fcst" value={evt.forecast} />
          <Stat label="Prev" value={evt.previous} />
        </div>
      )}

      {showBlockBand && (
        <div
          className="mt-2 text-[9px] uppercase"
          style={{
            letterSpacing: "0.22em",
            color: inBlockNow
              ? "var(--color-rose)"
              : "rgba(199, 119, 151, 0.55)",
          }}
        >
          {inBlockNow ? "Bot bloqueado" : "Bloqueo ±30m"}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-mute uppercase">{label}</span>
      <span
        className="font-mono"
        style={{
          color: accent && value ? "var(--color-rose)" : "var(--color-cream-muted)",
        }}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

// ---------- helpers ----------

type WeekDay = { year: number; month: number; day: number };

function buildWeekDays(now: Date): WeekDay[] {
  const today = nyDateParts(now);
  // weekday in NY (we approximate via the UTC Date of NY noon; close enough for label)
  const noon = nyWallToUTC(today.year, today.month, today.day, 12, 0);
  const dow = noon.getUTCDay(); // 0=Sun..6=Sat
  const offsetToMon = (dow + 6) % 7; // 0=Mon..6=Sun
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(noon);
    d.setUTCDate(d.getUTCDate() - offsetToMon + i);
    days.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    });
  }
  return days;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function getNyKey(d: Date): string {
  const p = nyDateParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function fmtNyHM(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d).replace(/^24:/, "00:");
}
