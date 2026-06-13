"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { COLOR_PRESETS, WIDTH_OPTIONS, type Drawing, type LineStyle } from "@/lib/drawings";

// Mini-barra contextual (estilo TradingView) que aparece sobre el dibujo
// seleccionado: color, grosor, estilo de línea y borrar. PR #19.
export function DrawingFloatToolbar({
  drawing,
  onColor,
  onWidth,
  onStyle,
  onDelete,
}: {
  drawing: Drawing;
  onColor: (c: string) => void;
  onWidth: (w: number) => void;
  onStyle: (s: LineStyle) => void;
  onDelete: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div
      className="flex items-center gap-0.5 px-1 py-1 rounded-lg shadow-lg"
      style={{ background: "rgba(20,20,22,0.97)", border: "0.5px solid var(--color-graphite)" }}
      // Evitar que el mousedown burbujee y el chart deseleccione.
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Color */}
      <div className="relative">
        <button
          title="Color"
          onClick={() => setPaletteOpen((o) => !o)}
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-shadow/60 transition-colors"
        >
          <span className="h-4 w-4 rounded-full" style={{ background: drawing.color, border: "1px solid rgba(255,255,255,0.3)" }} />
        </button>
        {paletteOpen && (
          <div
            className="absolute top-9 left-0 z-40 p-2 rounded-lg grid grid-cols-4 gap-1.5"
            style={{ background: "rgba(20,20,22,0.98)", border: "0.5px solid var(--color-graphite)" }}
          >
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => {
                  onColor(c);
                  setPaletteOpen(false);
                }}
                className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  border: c.toLowerCase() === drawing.color.toLowerCase() ? "2px solid #fff" : "1px solid rgba(255,255,255,0.25)",
                }}
              />
            ))}
            {/* Custom */}
            <label
              title="Color personalizado"
              className="h-5 w-5 rounded-full cursor-pointer flex items-center justify-center text-[9px] col-span-4 mt-1"
              style={{ width: "auto", borderRadius: 6, border: "0.5px solid var(--color-graphite)", color: "var(--color-cream-muted)" }}
            >
              + Personalizado
              <input
                type="color"
                value={drawing.color}
                onChange={(e) => onColor(e.target.value)}
                className="sr-only"
              />
            </label>
          </div>
        )}
      </div>

      <div className="w-px h-5 mx-0.5" style={{ background: "var(--color-graphite)" }} />

      {/* Grosor */}
      {WIDTH_OPTIONS.map((w) => {
        const active = drawing.width === w;
        return (
          <button
            key={w}
            title={`Grosor ${w}px`}
            onClick={() => onWidth(w)}
            className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${active ? "bg-shadow" : "hover:bg-shadow/60"}`}
          >
            <span
              className="block rounded-full"
              style={{ width: 16, height: w, background: active ? "var(--color-cream)" : "var(--color-cream-muted)" }}
            />
          </button>
        );
      })}

      <div className="w-px h-5 mx-0.5" style={{ background: "var(--color-graphite)" }} />

      {/* Estilo: sólida / punteada */}
      <button
        title="Línea sólida"
        onClick={() => onStyle("SOLID")}
        className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${drawing.lineStyle === "SOLID" ? "bg-shadow" : "hover:bg-shadow/60"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16">
          <line x1="1" y1="8" x2="15" y2="8" stroke={drawing.lineStyle === "SOLID" ? "var(--color-cream)" : "var(--color-cream-muted)"} strokeWidth="2" />
        </svg>
      </button>
      <button
        title="Línea punteada"
        onClick={() => onStyle("DASHED")}
        className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${drawing.lineStyle === "DASHED" ? "bg-shadow" : "hover:bg-shadow/60"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16">
          <line x1="1" y1="8" x2="15" y2="8" stroke={drawing.lineStyle === "DASHED" ? "var(--color-cream)" : "var(--color-cream-muted)"} strokeWidth="2" strokeDasharray="3 2" />
        </svg>
      </button>

      <div className="w-px h-5 mx-0.5" style={{ background: "var(--color-graphite)" }} />

      {/* Borrar */}
      <button
        title="Borrar dibujo"
        onClick={onDelete}
        className="h-7 w-7 rounded-md flex items-center justify-center text-mute hover:text-rose hover:bg-shadow/60 transition-colors"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}
