"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import { DrawingToolbar } from "./DrawingToolbar";
import {
  type Drawing,
  type Pt,
  type Tool,
  TOOL_CLICKS,
  computeRR,
  computeRiskUsd,
  computeRewardUsd,
  pips,
} from "@/lib/drawings";

const GOLD = "#C9A96E";
const UP = "#34d399";
const DOWN = "#f87171";

type PosDraft = {
  tool: "long" | "short";
  entry: number;
  sl: number;
  tp: number;
  time: number;
  volume: number;
};

export function DrawingLayer({
  chart,
  series,
  size,
  pair,
  timeframe,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  size: { w: number; h: number };
  pair: string;
  timeframe: string;
}) {
  const [tool, setTool] = useState<Tool>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [pending, setPending] = useState<Pt[]>([]);
  const [posDraft, setPosDraft] = useState<PosDraft | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/drawings?pair=${pair}&timeframe=${timeframe}`, { cache: "no-store" });
      if (!res.ok) return;
      const { drawings } = (await res.json()) as { drawings: Drawing[] };
      setDrawings(drawings);
    } catch {
      /* ignore */
    }
  }, [pair, timeframe]);

  useEffect(() => {
    refetch();
    setPending([]);
    setPosDraft(null);
    setTool("cursor");
  }, [refetch]);

  async function createDrawing(body: Record<string, unknown>) {
    await fetch("/api/drawings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, timeframe, ...body }),
    });
    await refetch();
  }

  async function clearAll() {
    await Promise.all(drawings.map((d) => fetch(`/api/drawings/${d.id}`, { method: "DELETE" })));
    await refetch();
  }

  async function deleteOne(id: string) {
    await fetch(`/api/drawings/${id}`, { method: "DELETE" });
    await refetch();
  }

  function handleClick(e: React.MouseEvent) {
    if (tool === "cursor" || !chart || !series) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    const time = chart.timeScale().coordinateToTime(x as never);
    if (price == null || time == null) return;
    const pt: Pt = { time: Number(time), price: Number(price) };
    const pts = [...pending, pt];
    if (pts.length < TOOL_CLICKS[tool]) {
      setPending(pts);
      return;
    }
    // Herramienta completa.
    if (tool === "long" || tool === "short") {
      setPosDraft({ tool, entry: pts[0].price, sl: pts[1].price, tp: pts[2].price, time: pts[0].time, volume: 0.1 });
      setPending([]);
      return;
    }
    if (tool === "hline") void createDrawing({ type: "HORIZONTAL_LINE", geometry: { price: pts[0].price }, color: GOLD });
    else if (tool === "vline") void createDrawing({ type: "VERTICAL_LINE", geometry: { time: pts[0].time }, color: GOLD });
    else if (tool === "trend") void createDrawing({ type: "TRENDLINE", geometry: { points: pts }, color: GOLD });
    else if (tool === "rect") void createDrawing({ type: "RECTANGLE", geometry: { points: pts }, color: GOLD });
    setPending([]);
    setTool("cursor");
  }

  async function savePosition(asTrade: boolean) {
    if (!posDraft) return;
    const { tool, entry, sl, tp, time, volume } = posDraft;
    const rRatio = computeRR(entry, sl, tp);
    const riskUsd = computeRiskUsd(entry, sl, volume);
    const res = await fetch("/api/drawings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pair,
        timeframe,
        type: tool === "long" ? "LONG_POSITION" : "SHORT_POSITION",
        geometry: { time },
        entryPrice: entry,
        slPrice: sl,
        tpPrice: tp,
        volume,
        riskUsd,
        rRatio,
        color: tool === "long" ? UP : DOWN,
      }),
    });
    const { drawing } = (await res.json().catch(() => ({}))) as { drawing?: { id: string } };
    if (asTrade && drawing?.id) {
      await fetch(`/api/drawings/${drawing.id}/convert-to-trade`, { method: "POST" });
    }
    setPosDraft(null);
    setTool("cursor");
    await refetch();
  }

  // ───── coordenadas ─────
  const W = size.w;
  const H = size.h;
  const yOf = (price: number) => series?.priceToCoordinate(price) ?? null;
  const xOf = (time: number) => chart?.timeScale().timeToCoordinate(time as UTCTimestamp) ?? null;

  return (
    <>
      <DrawingToolbar active={tool} onSelect={setTool} onClear={clearAll} />

      {/* Capa de captura (solo activa con una herramienta seleccionada) */}
      {tool !== "cursor" && (
        <div
          ref={captureRef}
          onClick={handleClick}
          className="absolute inset-0 z-10"
          style={{ cursor: "crosshair" }}
        />
      )}

      {/* Dibujos del usuario */}
      {chart && series && W > 0 && (
        <svg className="absolute inset-0 pointer-events-none" width={W} height={H}>
          {drawings.map((d) => (
            <DrawingShape key={d.id} d={d} W={W} H={H} yOf={yOf} xOf={xOf} onDelete={() => deleteOne(d.id)} />
          ))}
          {/* preview de puntos en progreso */}
          {pending.map((p, i) => {
            const cx = xOf(p.time);
            const cy = yOf(p.price);
            if (cx == null || cy == null) return null;
            return <circle key={i} cx={cx} cy={cy} r={3} fill={GOLD} />;
          })}
        </svg>
      )}

      {/* Popup de posición con R:R */}
      {posDraft && (
        <PositionPopup
          draft={posDraft}
          onVolume={(v) => setPosDraft({ ...posDraft, volume: v })}
          onCancel={() => {
            setPosDraft(null);
            setTool("cursor");
          }}
          onSave={savePosition}
        />
      )}
    </>
  );
}

function DrawingShape({
  d,
  W,
  H,
  yOf,
  xOf,
  onDelete,
}: {
  d: Drawing;
  W: number;
  H: number;
  yOf: (p: number) => number | null;
  xOf: (t: number) => number | null;
  onDelete: () => void;
}) {
  const del = (
    <circle
      className="pointer-events-auto cursor-pointer"
      r={5}
      fill="rgba(11,11,12,0.9)"
      stroke="var(--color-rose)"
      onClick={onDelete}
    />
  );

  if (d.type === "HORIZONTAL_LINE" && d.geometry.price != null) {
    const y = yOf(d.geometry.price);
    if (y == null) return null;
    return (
      <g>
        <line x1={0} y1={y} x2={W} y2={y} stroke={d.color} strokeWidth={1} strokeDasharray="2 2" />
        <text x={4} y={y - 3} fill={d.color} fontSize={9}>{d.geometry.price.toFixed(5)}</text>
        <g transform={`translate(${W - 10}, ${y})`}>{del}</g>
      </g>
    );
  }
  if (d.type === "VERTICAL_LINE" && d.geometry.time != null) {
    const x = xOf(d.geometry.time);
    if (x == null) return null;
    return (
      <g>
        <line x1={x} y1={0} x2={x} y2={H} stroke={d.color} strokeWidth={1} strokeDasharray="2 2" />
        <g transform={`translate(${x}, 10)`}>{del}</g>
      </g>
    );
  }
  if ((d.type === "TRENDLINE" || d.type === "RECTANGLE") && d.geometry.points?.length === 2) {
    const [a, b] = d.geometry.points;
    const ax = xOf(a.time), ay = yOf(a.price), bx = xOf(b.time), by = yOf(b.price);
    if (ax == null || ay == null || bx == null || by == null) return null;
    if (d.type === "TRENDLINE") {
      return (
        <g>
          <line x1={ax} y1={ay} x2={bx} y2={by} stroke={d.color} strokeWidth={1.5} />
          <g transform={`translate(${ax}, ${ay})`}>{del}</g>
        </g>
      );
    }
    const x = Math.min(ax, bx), y = Math.min(ay, by);
    return (
      <g>
        <rect x={x} y={y} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} fill={`${d.color}1a`} stroke={d.color} strokeWidth={1} />
        <g transform={`translate(${x}, ${y})`}>{del}</g>
      </g>
    );
  }
  if ((d.type === "LONG_POSITION" || d.type === "SHORT_POSITION") && d.entryPrice != null && d.slPrice != null && d.tpPrice != null) {
    const xe = xOf(d.geometry.time ?? 0) ?? 0;
    const left = Math.max(0, xe);
    const yE = yOf(d.entryPrice), ySL = yOf(d.slPrice), yTP = yOf(d.tpPrice);
    if (yE == null || ySL == null || yTP == null) return null;
    const long = d.type === "LONG_POSITION";
    return (
      <g>
        {/* zona ganancia (entry→TP) */}
        <rect x={left} y={Math.min(yE, yTP)} width={W - left} height={Math.abs(yTP - yE)} fill="rgba(52,211,153,0.12)" />
        {/* zona pérdida (entry→SL) */}
        <rect x={left} y={Math.min(yE, ySL)} width={W - left} height={Math.abs(ySL - yE)} fill="rgba(248,113,113,0.12)" />
        <line x1={left} y1={yE} x2={W} y2={yE} stroke="var(--color-cream)" strokeWidth={1} />
        <line x1={left} y1={yTP} x2={W} y2={yTP} stroke={UP} strokeWidth={1} strokeDasharray="4 2" />
        <line x1={left} y1={ySL} x2={W} y2={ySL} stroke={DOWN} strokeWidth={1} strokeDasharray="4 2" />
        <text x={left + 4} y={yE - 3} fill="var(--color-cream)" fontSize={9}>
          {long ? "LONG" : "SHORT"} {d.entryPrice.toFixed(5)} · R:R {d.rRatio?.toFixed(2) ?? "—"} · ${(d.riskUsd ?? 0).toFixed(0)}
        </text>
        <g transform={`translate(${left + 6}, ${yE})`}>{del}</g>
      </g>
    );
  }
  return null;
}

function PositionPopup({
  draft,
  onVolume,
  onCancel,
  onSave,
}: {
  draft: PosDraft;
  onVolume: (v: number) => void;
  onCancel: () => void;
  onSave: (asTrade: boolean) => void;
}) {
  const { tool, entry, sl, tp, volume } = draft;
  const rr = computeRR(entry, sl, tp);
  const riskUsd = computeRiskUsd(entry, sl, volume);
  const rewardUsd = computeRewardUsd(entry, tp, volume);
  const long = tool === "long";

  return (
    <div className="absolute top-12 right-3 z-30 w-64 rounded-lg p-4" style={{ background: "var(--color-onyx)", border: "0.5px solid var(--color-graphite)" }}>
      <div className="text-sm font-medium mb-2" style={{ color: long ? UP : DOWN }}>
        {long ? "▲ Posición Long" : "▼ Posición Short"}
      </div>
      <div className="space-y-1 text-xs text-cream-muted mb-3">
        <Row label="Entrada" value={entry.toFixed(5)} />
        <Row label="SL" value={`${sl.toFixed(5)} (${pips(entry, sl).toFixed(0)}p)`} />
        <Row label="TP" value={`${tp.toFixed(5)} (${pips(entry, tp).toFixed(0)}p)`} />
        <Row label="R:R" value={`1:${rr.toFixed(2)}`} highlight />
        <Row label="Riesgo" value={`$${riskUsd.toFixed(2)}`} />
        <Row label="Ganancia" value={`$${rewardUsd.toFixed(2)}`} />
      </div>
      <label className="block text-[10px] uppercase text-mute mb-1">Volumen (lotes)</label>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={volume}
        onChange={(e) => onVolume(Math.max(0.01, Number(e.target.value) || 0.01))}
        className="w-full mb-3 px-2 py-1 text-sm rounded bg-coal text-cream"
        style={{ border: "0.5px solid var(--color-graphite)" }}
      />
      <div className="flex flex-col gap-1.5">
        <button onClick={() => onSave(false)} className="py-1.5 text-xs rounded font-medium" style={{ background: "var(--color-coal)", color: "var(--color-cream)", border: "0.5px solid var(--color-graphite)" }}>
          Guardar dibujo
        </button>
        <button onClick={() => onSave(true)} className="py-1.5 text-xs rounded font-medium" style={{ background: "var(--color-rose-deep)", color: "var(--color-cream)" }}>
          Guardar como trade manual
        </button>
        <button onClick={onCancel} className="py-1 text-xs text-mute hover:text-cream">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-mono" style={{ color: highlight ? "var(--color-gold)" : "var(--color-cream)" }}>{value}</span>
    </div>
  );
}
