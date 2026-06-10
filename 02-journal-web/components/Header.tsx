"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { activeKillzone, formatNYClock } from "@/lib/killzones";
import { useNewsBlock } from "@/hooks/useNewsBlock";
import { useBotStatus, BOT_ONLINE_THRESHOLD_MS } from "@/hooks/useBotStatus";

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

export function Header() {
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
  const block = useNewsBlock();
  const bot = useBotStatus();

  // Estado del bot para el header (Bug #1): fuente única = BotConfig.BotEnabled
  // + heartbeat (último BotState). killSwitch manda; si está habilitado pero sin
  // señal reciente del EA, lo marcamos en ámbar.
  const online =
    !!bot.lastSeen && now != null && now.getTime() - Date.parse(bot.lastSeen) < BOT_ONLINE_THRESHOLD_MS;
  const botView = bot.killSwitch
    ? { label: "EMERGENCIA", color: "var(--color-rose)", dot: "var(--color-rose-deep)", pulse: false }
    : !bot.enabled
      ? { label: "BOT OFF", color: "var(--color-dust)", dot: "var(--color-mute)", pulse: false }
      : online
        ? { label: "BOT ON", color: "var(--color-cream-muted)", dot: "var(--color-profit-bright)", pulse: true }
        : { label: "BOT ON · sin señal", color: "var(--color-gold)", dot: "var(--color-gold)", pulse: false };

  return (
    <header
      className="h-16 bg-onyx flex items-center justify-between px-8"
      style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
    >
      {/* Fix 1: en /dashboard/chart la página ya muestra EUR/USD grande + bias,
          el breadcrumb "Chart" sobra. Lo ocultamos ahí. */}
      <div className="flex flex-col">
        {!pathname.startsWith("/dashboard/chart") && (
          <div className="text-sm text-cream-muted">
            {segments.length === 0 ? "Inicio" : pretty(last)}
          </div>
        )}
        {subtitle && (
          <div data-secondary="true" className="text-xs text-mute mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {block.isBlocked && (
          <span
            title={block.reason}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] uppercase font-medium"
            style={{
              background: "rgba(199, 119, 151, 0.14)",
              color: "var(--color-rose)",
              letterSpacing: "0.14em",
              border: "0.5px solid rgba(199, 119, 151, 0.35)",
            }}
          >
            <AlertTriangle className="h-3 w-3" strokeWidth={1.8} />
            Bot bloqueado
          </span>
        )}

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

        <span className="flex items-center gap-2" title={bot.lastSeen ? `Último reporte del EA: ${new Date(bot.lastSeen).toLocaleString("es-BO", { hour12: false })}` : "El EA no reportó todavía"}>
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${botView.pulse ? "gio-pulse" : ""}`}
            style={{ background: botView.dot }}
          />
          <span
            className="font-mono text-xs"
            style={{ letterSpacing: "0.14em", color: botView.color }}
          >
            {botView.label}
          </span>
        </span>
      </div>
    </header>
  );
}
