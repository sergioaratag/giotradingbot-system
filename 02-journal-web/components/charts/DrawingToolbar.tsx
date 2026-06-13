"use client";

import { MousePointer2, Minus, TrendingUp, Square, Circle, Type, Spline, Trash2 } from "lucide-react";
import type { Tool } from "@/lib/drawings";

const TOOLS: { id: Tool; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; rotate?: boolean }[] = [
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "hline", label: "Línea horizontal (click)", icon: Minus },
  { id: "trend", label: "Línea de tendencia (arrastrá)", icon: TrendingUp },
  { id: "rect", label: "Rectángulo (arrastrá)", icon: Square },
  { id: "oval", label: "Óvalo (arrastrá)", icon: Circle },
  { id: "text", label: "Texto (click)", icon: Type },
  { id: "freehand", label: "Ruta libre (arrastrá)", icon: Spline },
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
