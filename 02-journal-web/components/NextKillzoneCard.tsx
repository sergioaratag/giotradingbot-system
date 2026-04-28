"use client";

import { useEffect, useState } from "react";
import { activeKillzone, nextKillzone, formatHM } from "@/lib/killzones";

export function NextKillzoneCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const current = now ? activeKillzone(now) : null;
  const nx = now ? nextKillzone(now) : null;

  return (
    <div
      className="bg-coal rounded-lg p-5 flex items-center gap-3"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full gio-pulse"
        style={{ background: "var(--color-rose)" }}
      />
      <div className="flex-1 text-sm">
        {current ? (
          <>
            <span className="text-cream">Killzone {current.label} activa</span>
            <span className="text-dust"> · setups en juego</span>
          </>
        ) : nx ? (
          <>
            <span className="text-cream-muted">Próxima killzone:</span>{" "}
            <span className="text-cream">{nx.zone.label}</span>{" "}
            <span className="text-dust">
              en {formatHM(nx.minutesUntil)}
            </span>
          </>
        ) : (
          <span className="text-dust">Cargando…</span>
        )}
      </div>
    </div>
  );
}
