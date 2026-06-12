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

// ── PR #18 — Edición de dibujos (selección, mover, redimensionar) ──────────
// Solo los 4 tipos dibujables hoy: HORIZONTAL_LINE, TRENDLINE, RECTANGLE, FREEHAND.

export type ToCoord = (v: number) => number | null;

// Spec de un handle: anclado a tiempo/precio, o a una fracción del ancho (hline).
export type HandleSpec = { ix: number; xFrac?: number; time?: number; price: number };

// Tolerancia de hit-test en píxeles.
export const HIT_TOL = 7;

// Handles de un dibujo (para render y hit-test). Orden estable: el índice se usa
// en applyResize, así que NO reordenar sin actualizar applyResize.
export function drawingHandleSpecs(d: Drawing): HandleSpec[] {
  const g = d.geometry;
  if (d.type === "HORIZONTAL_LINE" && g.price != null) {
    return [
      { ix: 0, xFrac: 0.25, price: g.price },
      { ix: 1, xFrac: 0.75, price: g.price },
    ];
  }
  if (d.type === "TRENDLINE" && g.points?.length === 2) {
    return g.points.map((p, i) => ({ ix: i, time: p.time, price: p.price }));
  }
  if (d.type === "RECTANGLE" && g.points?.length === 2) {
    const [a, b] = g.points;
    const mt = (a.time + b.time) / 2;
    const mp = (a.price + b.price) / 2;
    return [
      { ix: 0, time: a.time, price: a.price }, // esquina A
      { ix: 1, time: b.time, price: a.price }, // esquina B-time / A-price
      { ix: 2, time: b.time, price: b.price }, // esquina B
      { ix: 3, time: a.time, price: b.price }, // esquina A-time / B-price
      { ix: 4, time: mt, price: a.price }, // medio borde A-price
      { ix: 5, time: b.time, price: mp }, // medio borde B-time
      { ix: 6, time: mt, price: b.price }, // medio borde B-price
      { ix: 7, time: a.time, price: mp }, // medio borde A-time
    ];
  }
  if (d.type === "FREEHAND" && g.points && g.points.length >= 2) {
    return g.points.map((p, i) => ({ ix: i, time: p.time, price: p.price }));
  }
  return [];
}

// Posición en píxeles de un handle.
export function handlePixel(h: HandleSpec, toX: ToCoord, toY: ToCoord, W: number): { x: number; y: number } | null {
  const y = toY(h.price);
  if (y == null) return null;
  const x = h.xFrac != null ? W * h.xFrac : h.time != null ? toX(h.time) : null;
  if (x == null) return null;
  return { x, y };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ¿El click (px,py) cae sobre un handle del dibujo? Devuelve su índice o null.
// FREEHAND: handles solo visuales, no se redimensionan → no hit de handle.
export function hitHandle(
  d: Drawing,
  px: number,
  py: number,
  toX: ToCoord,
  toY: ToCoord,
  W: number,
  tol = HIT_TOL,
): number | null {
  if (d.type === "FREEHAND") return null;
  for (const h of drawingHandleSpecs(d)) {
    const pos = handlePixel(h, toX, toY, W);
    if (pos && Math.hypot(px - pos.x, py - pos.y) <= tol + 1) return h.ix;
  }
  return null;
}

// ¿El click cae sobre el cuerpo del dibujo (para moverlo / seleccionarlo)?
export function hitBody(
  d: Drawing,
  px: number,
  py: number,
  toX: ToCoord,
  toY: ToCoord,
  W: number,
  tol = HIT_TOL,
): boolean {
  const g = d.geometry;
  if (d.type === "HORIZONTAL_LINE" && g.price != null) {
    const y = toY(g.price);
    return y != null && Math.abs(py - y) <= tol;
  }
  if (d.type === "TRENDLINE" && g.points?.length === 2) {
    const [a, b] = g.points;
    const ax = toX(a.time), ay = toY(a.price), bx = toX(b.time), by = toY(b.price);
    if (ax == null || ay == null || bx == null || by == null) return false;
    return distToSegment(px, py, ax, ay, bx, by) <= tol;
  }
  if (d.type === "RECTANGLE" && g.points?.length === 2) {
    const [a, b] = g.points;
    const ax = toX(a.time), ay = toY(a.price), bx = toX(b.time), by = toY(b.price);
    if (ax == null || ay == null || bx == null || by == null) return false;
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by), maxY = Math.max(ay, by);
    return px >= minX - tol && px <= maxX + tol && py >= minY - tol && py <= maxY + tol;
  }
  if (d.type === "FREEHAND" && g.points && g.points.length >= 2) {
    for (let i = 1; i < g.points.length; i++) {
      const a = g.points[i - 1], b = g.points[i];
      const ax = toX(a.time), ay = toY(a.price), bx = toX(b.time), by = toY(b.price);
      if (ax == null || ay == null || bx == null || by == null) continue;
      if (distToSegment(px, py, ax, ay, bx, by) <= tol) return true;
    }
    return false;
  }
  return false;
}

// Geometría tras mover el dibujo completo por (dTime, dPrice).
export function applyMove(d: Drawing, dTime: number, dPrice: number): Drawing["geometry"] {
  const g = d.geometry;
  if (d.type === "HORIZONTAL_LINE" && g.price != null) return { ...g, price: g.price + dPrice };
  if (g.points) return { ...g, points: g.points.map((p) => ({ time: p.time + dTime, price: p.price + dPrice })) };
  return g;
}

// Geometría tras arrastrar el handle `ix` al punto `pt` (tiempo/precio).
export function applyResize(d: Drawing, ix: number, pt: Pt): Drawing["geometry"] {
  const g = d.geometry;
  if (d.type === "HORIZONTAL_LINE") return { ...g, price: pt.price };
  if (d.type === "TRENDLINE" && g.points?.length === 2) {
    return { ...g, points: g.points.map((p, i) => (i === ix ? { time: pt.time, price: pt.price } : p)) };
  }
  if (d.type === "RECTANGLE" && g.points?.length === 2) {
    const a = { ...g.points[0] };
    const b = { ...g.points[1] };
    switch (ix) {
      case 0: a.time = pt.time; a.price = pt.price; break;
      case 1: b.time = pt.time; a.price = pt.price; break;
      case 2: b.time = pt.time; b.price = pt.price; break;
      case 3: a.time = pt.time; b.price = pt.price; break;
      case 4: a.price = pt.price; break; // borde A-price
      case 5: b.time = pt.time; break; // borde B-time
      case 6: b.price = pt.price; break; // borde B-price
      case 7: a.time = pt.time; break; // borde A-time
    }
    return { ...g, points: [a, b] };
  }
  return g; // FREEHAND: sin resize por vértice en este PR
}
