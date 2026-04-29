"use client";

import Link from "next/link";
import { AlertOctagon } from "lucide-react";
import { useBotStatus } from "@/hooks/useBotStatus";

export function KillSwitchBanner() {
  const { killSwitch, loading } = useBotStatus();
  if (loading || !killSwitch) return null;

  return (
    <div
      className="w-full px-6 py-2 flex items-center justify-center gap-3"
      style={{
        background: "rgba(107, 107, 112, 0.18)",
        borderBottom: "0.5px solid rgba(107, 107, 112, 0.40)",
      }}
    >
      <AlertOctagon
        className="h-4 w-4 shrink-0"
        strokeWidth={1.8}
        style={{ color: "var(--color-loss)" }}
      />
      <span
        className="text-xs uppercase font-medium"
        style={{
          color: "var(--color-loss)",
          letterSpacing: "0.18em",
        }}
      >
        Kill switch activo · Bot detenido
      </span>
      <Link
        href="/settings#bot"
        className="text-[10px] uppercase underline-offset-2 hover:underline"
        style={{
          color: "var(--color-cream-muted)",
          letterSpacing: "0.18em",
        }}
      >
        Desactivar
      </Link>
    </div>
  );
}
