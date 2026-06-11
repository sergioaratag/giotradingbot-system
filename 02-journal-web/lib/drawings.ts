// Fase 6B — Tipos y helpers de dibujos del usuario sobre el chart.

export type DrawingType =
  | "HORIZONTAL_LINE"
  | "VERTICAL_LINE"
  | "TRENDLINE"
  | "RECTANGLE"
  | "TEXT"
  | "FREEHAND"
  | "LONG_POSITION"
  | "SHORT_POSITION";

export type Pt = { time: number; price: number };

export type Drawing = {
  id: string;
  pair: string;
  timeframe: string | null;
  type: DrawingType;
  geometry: { points?: Pt[]; price?: number; time?: number; text?: string };
  entryPrice: number | null;
  slPrice: number | null;
  tpPrice: number | null;
  volume: number | null;
  riskUsd: number | null;
  rRatio: number | null;
  color: string;
  label: string | null;
};

export type Tool = "cursor" | "hline" | "vline" | "trend" | "rect" | "freehand" | "long" | "short";

// Cuántos clicks necesita cada herramienta para completarse (modo click).
export const TOOL_CLICKS: Record<Tool, number> = {
  cursor: 0,
  hline: 1,
  vline: 1,
  trend: 2,
  rect: 2,
  freehand: 0,
  long: 3,
  short: 3,
};

// Herramientas de click-drag (mousedown → mover → mouseup). hline es 1 click.
export function isDragTool(t: Tool): boolean {
  return t === "trend" || t === "rect" || t === "freehand";
}

// EUR/USD y GBP/USD: 1 pip = 0.0001; valor del pip por lote estándar = $10.
const PIP = 0.0001;
const PIP_VALUE_PER_LOT = 10;

export function pips(a: number, b: number): number {
  return Math.abs(a - b) / PIP;
}

// R:R = recompensa / riesgo (distancias de precio).
export function computeRR(entry: number, sl: number, tp: number): number {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return 0;
  return reward / risk;
}

export function computeRiskUsd(entry: number, sl: number, volume: number): number {
  return pips(entry, sl) * PIP_VALUE_PER_LOT * volume;
}

export function computeRewardUsd(entry: number, tp: number, volume: number): number {
  return pips(entry, tp) * PIP_VALUE_PER_LOT * volume;
}
