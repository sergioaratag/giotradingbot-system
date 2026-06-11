"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Check } from "lucide-react";
import {
  type ChartTheme,
  DEFAULT_CHART_THEME,
  CHART_THEME_FIELDS,
  normalizeChartTheme,
} from "@/lib/chart-theme";

export function ChartThemeSettings() {
  const [theme, setTheme] = useState<ChartTheme>(DEFAULT_CHART_THEME);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/account/chart-theme", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.theme) setTheme(normalizeChartTheme(d.theme));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function set(key: keyof ChartTheme, value: string) {
    setTheme((t) => ({ ...t, [key]: value }));
    setSaved(false);
  }

  async function save(next: ChartTheme = theme) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/account/chart-theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  function restore() {
    setTheme(DEFAULT_CHART_THEME);
    void save(DEFAULT_CHART_THEME);
  }

  return (
    <section className="mb-10">
      <h2 className="text-sm font-medium text-cream mb-1" style={{ letterSpacing: "0.3px" }}>
        Apariencia del Chart
      </h2>
      <p className="text-xs text-mute mb-4">
        Colores del gráfico (se aplican al volver a abrir el chart). Suaves para sesiones largas.
      </p>

      {!loaded ? (
        <p className="text-xs text-mute">Cargando…</p>
      ) : (
        <>
          {/* Preview */}
          <div
            className="mb-4 rounded-md p-4 flex items-end gap-4 h-24"
            style={{ background: theme.background, border: "0.5px solid var(--color-graphite)" }}
          >
            <Candle color={theme.candleUp} tall />
            <Candle color={theme.candleDown} />
            <Candle color={theme.candleUp} />
            <div className="ml-auto flex gap-1.5">
              {[theme.kzLondon, theme.kzNyAm, theme.kzNyLunch].map((c, i) => (
                <span key={i} className="inline-block w-4 h-12 rounded-sm" style={{ background: `${c}33`, border: `1px dashed ${c}` }} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {CHART_THEME_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-cream-muted">{f.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-mute">{theme[f.key]}</span>
                  <input
                    type="color"
                    value={theme[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="h-7 w-9 rounded cursor-pointer bg-transparent"
                  />
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs rounded-md font-medium disabled:opacity-50"
              style={{ background: "var(--color-rose)", color: "var(--color-onyx)", letterSpacing: "0.14em" }}
            >
              {saved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
              {saving ? "Guardando…" : saved ? "Guardado" : "Guardar colores"}
            </button>
            <button
              onClick={restore}
              className="inline-flex items-center gap-1.5 text-xs text-cream-muted hover:text-rose transition-colors"
              style={{ letterSpacing: "0.14em" }}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />
              Restaurar predeterminados
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Candle({ color, tall }: { color: string; tall?: boolean }) {
  return (
    <span className="relative flex flex-col items-center justify-end" style={{ height: "100%" }}>
      <span className="absolute top-0 bottom-0 w-px" style={{ background: color }} />
      <span className="relative w-3 rounded-[1px]" style={{ background: color, height: tall ? "60%" : "38%" }} />
    </span>
  );
}
