// PR #14 — Paleta del chart, personalizable por usuario (persistida en User.chartTheme).
// Default: dark elegante, suave para los ojos (estilo "trading terminal"), no fluorescente.

export type ChartTheme = {
  background: string;
  grid: string;
  candleUp: string;
  candleDown: string;
  kzLondon: string;
  kzNyAm: string;
  kzNyLunch: string;
};

// Paleta TradingView dark (colores exactos de tradingview.com).
export const DEFAULT_CHART_THEME: ChartTheme = {
  background: "#131722",
  grid: "#1e222d",
  candleUp: "#26a69a",
  candleDown: "#ef5350",
  kzLondon: "#2196f3", // celeste
  kzNyAm: "#ef5350", // rosa/rojo
  kzNyLunch: "#9e9e9e", // gris
};

export const CHART_THEME_FIELDS: { key: keyof ChartTheme; label: string }[] = [
  { key: "candleUp", label: "Velas alcistas" },
  { key: "candleDown", label: "Velas bajistas" },
  { key: "background", label: "Fondo" },
  { key: "grid", label: "Grid" },
  { key: "kzLondon", label: "Killzone Londres" },
  { key: "kzNyAm", label: "Killzone NY AM" },
  { key: "kzNyLunch", label: "Killzone NY Lunch" },
];

// Normaliza cualquier objeto parcial a un ChartTheme completo (rellena con default).
export function normalizeChartTheme(raw: unknown): ChartTheme {
  const t = (raw ?? {}) as Partial<ChartTheme>;
  const hex = (v: unknown, fallback: string) =>
    typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  return {
    background: hex(t.background, DEFAULT_CHART_THEME.background),
    grid: hex(t.grid, DEFAULT_CHART_THEME.grid),
    candleUp: hex(t.candleUp, DEFAULT_CHART_THEME.candleUp),
    candleDown: hex(t.candleDown, DEFAULT_CHART_THEME.candleDown),
    kzLondon: hex(t.kzLondon, DEFAULT_CHART_THEME.kzLondon),
    kzNyAm: hex(t.kzNyAm, DEFAULT_CHART_THEME.kzNyAm),
    kzNyLunch: hex(t.kzNyLunch, DEFAULT_CHART_THEME.kzNyLunch),
  };
}

// #RRGGBB → rgba(r,g,b,a) para fills/strokes translúcidos.
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
