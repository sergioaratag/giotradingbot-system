"use client";

import { MousePointer2, Minus, TrendingUp, Square, Trash2 } from "lucide-react";
import type { Tool } from "@/lib/drawings";

// PR #16: scope acotado — cursor + 3 herramientas. El resto (vline, óvalo,
// texto, posiciones Long/Short, etc.) va en PRs siguientes.
const TOOLS: { id: Tool; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; rotate?: boolean }[] = [
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "hline", label: "Línea horizontal", icon: Minus },
  { id: "trend", label: "Línea de tendencia", icon: TrendingUp },
  { id: "rect", label: "Rectángulo", icon: Square },
];

export function DrawingToolbar({
  active,
  onSelect,
  onClear,
}: {
  active: Tool;
  onSelect: (t: Tool) => void;
  onClear: () => void;
}) {
  return (
    <div
      className="absolute top-12 left-2 z-20 flex flex-col gap-0.5 p-1 rounded-lg"
      style={{ background: "rgba(11,11,12,0.9)", border: "0.5px solid var(--color-graphite)" }}
    >
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        const color =
          t.id === "long" ? "#34d399" : t.id === "short" ? "#f87171" : isActive ? "var(--color-cream)" : "var(--color-cream-muted)";
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            title={t.label}
            className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
              isActive ? "bg-shadow" : "hover:bg-shadow/50"
            }`}
            style={{ color }}
          >
            <Icon className={`h-4 w-4 ${t.rotate ? "rotate-90" : ""}`} strokeWidth={1.7} />
          </button>
        );
      })}
      <div className="h-px my-0.5" style={{ background: "var(--color-graphite)" }} />
      <button
        onClick={onClear}
        title="Borrar todos mis dibujos del par"
        className="h-8 w-8 rounded-md flex items-center justify-center text-mute hover:text-rose hover:bg-shadow/50 transition-colors"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}
