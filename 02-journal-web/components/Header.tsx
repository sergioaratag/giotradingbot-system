"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { activeKillzone, formatNYClock } from "@/lib/killzones";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  trades: "Trades",
  tasks: "Tasks",
  notes: "Notes",
  news: "News",
  vault: "Vault",
  settings: "Settings",
  new: "Nueva",
};

const SUBTITLES: Record<string, string> = {
  tasks: "Tablero Kanban · arrastra para mover entre columnas",
  vault: "Tu santuario.",
};

function pretty(s: string) {
  return LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

export function Header({ botOnline = false }: { botOnline?: boolean }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "dashboard";
  const subtitle = SUBTITLES[last];

  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const kz = now ? activeKillzone(now) : null;
  const clock = now ? formatNYClock(now) : "—";

  return (
    <header
      className="h-16 bg-onyx flex items-center justify-between px-8"
      style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
    >
      <div className="flex flex-col">
        <div className="text-sm text-cream-muted">
          {segments.length === 0 ? "Inicio" : pretty(last)}
        </div>
        {subtitle && (
          <div data-secondary="true" className="text-xs text-mute mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {kz && (
          <span
            className="px-2 py-0.5 rounded-md text-[10px] uppercase font-medium"
            style={{
              background: "rgba(199, 119, 151, 0.10)",
              color: "var(--color-rose)",
              letterSpacing: "0.12em",
            }}
          >
            Killzone {kz.label}
          </span>
        )}

        <span
          data-secondary="true"
          className="font-mono text-xs text-cream-muted tabular-nums"
        >
          {clock}
        </span>

        <span
          aria-hidden
          style={{
            width: "1px",
            height: "12px",
            background: "var(--color-graphite)",
          }}
        />

        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              botOnline ? "gio-pulse" : ""
            }`}
            style={{
              background: botOnline
                ? "var(--color-rose)"
                : "var(--color-mute)",
            }}
          />
          <span
            className="font-mono text-xs text-dust"
            style={{ letterSpacing: "0.14em" }}
          >
            BOT {botOnline ? "ON" : "OFF"}
          </span>
        </span>
      </div>
    </header>
  );
}
