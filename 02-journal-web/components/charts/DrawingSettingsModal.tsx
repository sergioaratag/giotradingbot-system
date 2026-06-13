"use client";

import { useState } from "react";
import {
  COLOR_PRESETS,
  WIDTH_OPTIONS,
  TIMEFRAMES,
  resolveFont,
  resolveFill,
  effectiveVisibleTFs,
  type Drawing,
  type LineStyle,
  type TextAlign,
} from "@/lib/drawings";

type Patch = {
  color: string;
  width: number;
  lineStyle: LineStyle;
  label: string | null;
  geometry: Drawing["geometry"];
};

type Tab = "estilo" | "texto" | "coordenadas" | "visibilidad";
const TABS: { id: Tab; label: string }[] = [
  { id: "estilo", label: "Estilo" },
  { id: "texto", label: "Texto" },
  { id: "coordenadas", label: "Coordenadas" },
  { id: "visibilidad", label: "Visibilidad" },
];

const isLine = (t: Drawing["type"]) => t === "HORIZONTAL_LINE" || t === "TRENDLINE" || t === "FREEHAND";
const isBox = (t: Drawing["type"]) => t === "RECTANGLE" || t === "OVAL";

// Precios editables de un dibujo (con su etiqueta), según tipo.
function initialPrices(d: Drawing): { label: string; value: number }[] {
  const g = d.geometry;
  if (d.type === "HORIZONTAL_LINE" && g.price != null) return [{ label: "Precio", value: g.price }];
  if (d.type === "TEXT" && g.price != null) return [{ label: "Precio", value: g.price }];
  if (g.points?.length) {
    return g.points.map((p, i) => ({ label: `Punto ${String.fromCharCode(65 + i)}`, value: p.price }));
  }
  return [];
}

export function DrawingSettingsModal({
  drawing,
  onApply,
  onClose,
}: {
  drawing: Drawing;
  onApply: (patch: Patch) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(drawing.type === "TEXT" ? "texto" : "estilo");

  const [color, setColor] = useState(drawing.color);
  const [width, setWidth] = useState<number>(drawing.width ?? 2);
  const [lineStyle, setLineStyle] = useState<LineStyle>(drawing.lineStyle ?? "SOLID");
  const [label, setLabel] = useState(drawing.label ?? "");

  const fill0 = resolveFill(drawing);
  const [fillEnabled, setFillEnabled] = useState(fill0.enabled);
  const [fillColor, setFillColor] = useState(fill0.color);
  const [fillOpacity, setFillOpacity] = useState(fill0.opacity);

  const font0 = resolveFont(drawing.geometry.font);
  const [fontSize, setFontSize] = useState(font0.size);
  const [bold, setBold] = useState(font0.bold);
  const [italic, setItalic] = useState(font0.italic);
  const [align, setAlign] = useState<TextAlign>(font0.align);
  const [text, setText] = useState(drawing.geometry.text ?? "");

  const [prices, setPrices] = useState(initialPrices(drawing));
  const editablePrices = drawing.type !== "FREEHAND";

  const [tfs, setTfs] = useState<string[]>(effectiveVisibleTFs(drawing));

  function buildGeometry(): Drawing["geometry"] {
    const g: Drawing["geometry"] = { ...drawing.geometry, visibleTimeframes: tfs };
    // Precios editados → de vuelta a la geometría.
    if (editablePrices && prices.length) {
      if (drawing.type === "HORIZONTAL_LINE" || drawing.type === "TEXT") {
        g.price = prices[0].value;
      } else if (g.points?.length) {
        g.points = g.points.map((p, i) => ({ ...p, price: prices[i]?.value ?? p.price }));
      }
    }
    if (isBox(drawing.type)) {
      g.fill = { enabled: fillEnabled, color: fillColor, opacity: fillOpacity };
    }
    if (drawing.type === "TEXT") {
      g.font = { size: fontSize, bold, italic, align };
      g.text = text;
    }
    return g;
  }

  function accept() {
    onApply({
      color,
      width,
      lineStyle,
      label: drawing.type === "TEXT" ? drawing.label ?? null : label.trim() || null,
      geometry: buildGeometry(),
    });
  }

  function toggleTf(tf: string) {
    setTfs((prev) => (prev.includes(tf) ? prev.filter((x) => x !== tf) : [...prev, tf]));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg overflow-hidden flex flex-col"
        style={{ background: "var(--color-coal, #121316)", border: "0.5px solid var(--color-graphite)", maxHeight: "85vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header + tabs */}
        <div className="px-4 pt-3" style={{ borderBottom: "0.5px solid var(--color-graphite)" }}>
          <div className="text-sm font-semibold mb-2" style={{ color: "var(--color-cream)" }}>
            Ajustes del dibujo
          </div>
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-3 py-1.5 text-xs rounded-t-md transition-colors"
                style={{
                  color: tab === t.id ? "var(--color-cream)" : "var(--color-cream-muted)",
                  borderBottom: tab === t.id ? "2px solid var(--color-gold, #C9A96E)" : "2px solid transparent",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4 overflow-y-auto text-sm" style={{ color: "var(--color-cream)" }}>
          {tab === "estilo" && (
            <div className="flex flex-col gap-4">
              <Field label={drawing.type === "TEXT" ? "Color del texto" : "Color"}>
                <ColorPicker value={color} onChange={setColor} />
              </Field>
              {isLine(drawing.type) || isBox(drawing.type) ? (
                <>
                  <Field label="Grosor">
                    <div className="flex gap-1.5">
                      {WIDTH_OPTIONS.map((w) => (
                        <button
                          key={w}
                          onClick={() => setWidth(w)}
                          className="h-8 w-8 rounded flex items-center justify-center"
                          style={{ background: width === w ? "var(--color-graphite)" : "transparent", border: "0.5px solid var(--color-graphite)" }}
                        >
                          <span style={{ display: "block", width: 16, height: w, background: "var(--color-cream)" }} />
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Estilo de línea">
                    <div className="flex gap-1.5">
                      {(["SOLID", "DASHED"] as LineStyle[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setLineStyle(s)}
                          className="px-3 h-8 rounded text-xs"
                          style={{ background: lineStyle === s ? "var(--color-graphite)" : "transparent", border: "0.5px solid var(--color-graphite)", color: "var(--color-cream)" }}
                        >
                          {s === "SOLID" ? "Sólida" : "Punteada"}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              ) : null}
              {isBox(drawing.type) && (
                <Field label="Relleno">
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={fillEnabled} onChange={(e) => setFillEnabled(e.target.checked)} />
                      Mostrar relleno
                    </label>
                    {fillEnabled && (
                      <>
                        <ColorPicker value={fillColor} onChange={setFillColor} />
                        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-cream-muted)" }}>
                          Opacidad
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.02}
                            value={fillOpacity}
                            onChange={(e) => setFillOpacity(Number(e.target.value))}
                            className="flex-1"
                          />
                          <span style={{ width: 32 }}>{Math.round(fillOpacity * 100)}%</span>
                        </div>
                      </>
                    )}
                  </div>
                </Field>
              )}
            </div>
          )}

          {tab === "texto" && (
            <div className="flex flex-col gap-4">
              {drawing.type === "TEXT" ? (
                <>
                  <Field label="Texto">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={2}
                      className="w-full rounded px-2 py-1 text-sm resize-none outline-none"
                      style={{ background: "var(--color-shadow, #0b0b0c)", border: "0.5px solid var(--color-graphite)", color: "var(--color-cream)" }}
                    />
                  </Field>
                  <Field label="Tamaño de fuente">
                    <input
                      type="number"
                      min={8}
                      max={48}
                      value={fontSize}
                      onChange={(e) => setFontSize(Math.max(8, Math.min(48, Number(e.target.value) || 14)))}
                      className="w-20 rounded px-2 py-1 text-sm outline-none"
                      style={{ background: "var(--color-shadow, #0b0b0c)", border: "0.5px solid var(--color-graphite)", color: "var(--color-cream)" }}
                    />
                  </Field>
                  <Field label="Formato">
                    <div className="flex gap-1.5">
                      <Toggle active={bold} onClick={() => setBold((b) => !b)} label="B" boldLabel />
                      <Toggle active={italic} onClick={() => setItalic((i) => !i)} label="I" italicLabel />
                    </div>
                  </Field>
                  <Field label="Alineación">
                    <div className="flex gap-1.5">
                      {(["left", "center", "right"] as TextAlign[]).map((a) => (
                        <button
                          key={a}
                          onClick={() => setAlign(a)}
                          className="px-3 h-8 rounded text-xs capitalize"
                          style={{ background: align === a ? "var(--color-graphite)" : "transparent", border: "0.5px solid var(--color-graphite)", color: "var(--color-cream)" }}
                        >
                          {a === "left" ? "Izq." : a === "center" ? "Centro" : "Der."}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              ) : (
                <Field label="Etiqueta (opcional)">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Texto que se muestra sobre el dibujo"
                    className="w-full rounded px-2 py-1 text-sm outline-none"
                    style={{ background: "var(--color-shadow, #0b0b0c)", border: "0.5px solid var(--color-graphite)", color: "var(--color-cream)" }}
                  />
                </Field>
              )}
            </div>
          )}

          {tab === "coordenadas" && (
            <div className="flex flex-col gap-3">
              {!editablePrices ? (
                <p className="text-xs" style={{ color: "var(--color-cream-muted)" }}>
                  La ruta libre tiene muchos puntos; sus coordenadas no se editan acá.
                </p>
              ) : (
                prices.map((p, i) => (
                  <Field key={i} label={`${p.label} (precio)`}>
                    <input
                      type="number"
                      step="0.00001"
                      value={p.value}
                      onChange={(e) =>
                        setPrices((prev) => prev.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)))
                      }
                      className="w-40 rounded px-2 py-1 text-sm font-mono outline-none"
                      style={{ background: "var(--color-shadow, #0b0b0c)", border: "0.5px solid var(--color-graphite)", color: "var(--color-cream)" }}
                    />
                  </Field>
                ))
              )}
              <p className="text-xs" style={{ color: "var(--color-cream-muted)" }}>
                El tiempo (eje X) es de solo lectura en esta versión.
              </p>
            </div>
          )}

          {tab === "visibilidad" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs mb-1" style={{ color: "var(--color-cream-muted)" }}>
                El dibujo se muestra solo en los timeframes marcados.
              </p>
              {TIMEFRAMES.map((tf) => (
                <label key={tf} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tfs.includes(tf)} onChange={() => toggleTf(tf)} />
                  {tf}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 flex justify-end gap-2" style={{ borderTop: "0.5px solid var(--color-graphite)" }}>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs"
            style={{ border: "0.5px solid var(--color-graphite)", color: "var(--color-cream)" }}
          >
            Cancelar
          </button>
          <button
            onClick={accept}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: "var(--color-gold, #C9A96E)", color: "#1a1206" }}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs" style={{ color: "var(--color-cream-muted)" }}>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ active, onClick, label, boldLabel, italicLabel }: { active: boolean; onClick: () => void; label: string; boldLabel?: boolean; italicLabel?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="h-8 w-8 rounded flex items-center justify-center text-sm"
      style={{
        background: active ? "var(--color-graphite)" : "transparent",
        border: "0.5px solid var(--color-graphite)",
        color: "var(--color-cream)",
        fontWeight: boldLabel ? 800 : 400,
        fontStyle: italicLabel ? "italic" : "normal",
      }}
    >
      {label}
    </button>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="h-6 w-6 rounded-full transition-transform hover:scale-110"
          style={{ background: c, border: c.toLowerCase() === value.toLowerCase() ? "2px solid #fff" : "1px solid rgba(255,255,255,0.25)" }}
          title={c}
        />
      ))}
      <label className="h-6 w-6 rounded-full cursor-pointer flex items-center justify-center" style={{ border: "0.5px solid var(--color-graphite)", color: "var(--color-cream-muted)" }} title="Color personalizado">
        +
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
      </label>
    </div>
  );
}
