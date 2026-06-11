"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams } from "lightweight-charts";
import { DrawingToolbar } from "./DrawingToolbar";
import { DrawingsPrimitive } from "./drawings-primitive";
import { type Drawing, type Pt, type Tool, isDragTool } from "@/lib/drawings";

const GOLD = "#C9A96E";

export function DrawingLayer({
  chart,
  series,
  pair,
  timeframe,
  onActiveChange,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  pair: string;
  timeframe: string;
  onActiveChange?: (active: boolean) => void;
}) {
  const [tool, setTool] = useState<Tool>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;

  // Primitive singleton (no se recrea por render).
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  if (!primitiveRef.current) primitiveRef.current = new DrawingsPrimitive();

  // Estado de input (refs, no state → sin re-render por movimiento).
  const lastPtRef = useRef<Pt | null>(null);
  const dragRef = useRef<{ start: Pt; path: Pt[] } | null>(null);
  const startRef = useRef<Pt | null>(null);

  // Attach del primitive a la serie.
  useEffect(() => {
    if (!series) return;
    const prim = primitiveRef.current!;
    series.attachPrimitive(prim);
    prim.setDrawings(drawingsRef.current);
    return () => series.detachPrimitive(prim);
  }, [series]);

  // Fetch de dibujos: UNA vez por par/TF.
  useEffect(() => {
    let alive = true;
    setTool("cursor");
    dragRef.current = null;
    startRef.current = null;
    primitiveRef.current?.setPreview(null);
    fetch(`/api/drawings?pair=${pair}&timeframe=${timeframe}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { drawings: [] }))
      .then((d) => alive && setDrawings(d.drawings ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pair, timeframe]);

  // Empujar dibujos al primitive cuando cambian (no en cada render).
  useEffect(() => {
    primitiveRef.current?.setDrawings(drawings);
  }, [drawings]);

  // Activo: avisar + cursor + bloquear scroll/scale mientras se dibuja.
  useEffect(() => {
    const active = tool !== "cursor";
    onActiveChange?.(active);
    const el = chart?.chartElement?.();
    if (el) el.style.cursor = active ? "crosshair" : "";
    chart?.applyOptions({ handleScroll: !active, handleScale: !active });
  }, [tool, chart, onActiveChange]);

  async function refetch() {
    const r = await fetch(`/api/drawings?pair=${pair}&timeframe=${timeframe}`, { cache: "no-store" });
    if (r.ok) setDrawings((await r.json()).drawings ?? []);
  }
  async function createDrawing(body: Record<string, unknown>) {
    primitiveRef.current?.setPreview(null);
    await fetch("/api/drawings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, timeframe, color: GOLD, ...body }),
    });
    await refetch();
  }
  async function clearAll() {
    await Promise.all(drawingsRef.current.map((d) => fetch(`/api/drawings/${d.id}`, { method: "DELETE" })));
    await refetch();
  }

  function reset() {
    dragRef.current = null;
    startRef.current = null;
    primitiveRef.current?.setPreview(null);
    setTool("cursor");
  }

  // Crosshair → punto actual + preview en vivo durante el drag.
  useEffect(() => {
    if (!chart || !series) return;
    const onMove = (param: MouseEventParams) => {
      if (!param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      let time: number | null = param.time != null ? Number(param.time) : null;
      if (time == null) {
        const ct = chart.timeScale().coordinateToTime(param.point.x);
        time = ct != null ? Number(ct) : null;
      }
      if (price == null || time == null) return;
      const pt: Pt = { time, price };
      lastPtRef.current = pt;
      const drag = dragRef.current;
      const t = toolRef.current;
      if (drag) {
        if (t === "freehand") {
          drag.path.push(pt);
          primitiveRef.current?.setPreview({ tool: "freehand", points: drag.path });
        } else {
          primitiveRef.current?.setPreview({ tool: t, points: [drag.start, pt] });
        }
      }
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [chart, series]);

  // mousedown / mouseup para el drag (coords vienen del crosshair → confiables).
  useEffect(() => {
    const el = chart?.chartElement?.();
    if (!el) return;
    const onDown = () => {
      const t = toolRef.current;
      if (t === "cursor") return;
      const pt = lastPtRef.current;
      if (!pt) return;
      startRef.current = pt;
      if (isDragTool(t)) {
        dragRef.current = { start: pt, path: [pt] };
        primitiveRef.current?.setPreview({ tool: t, points: [pt] });
      }
    };
    const onUp = () => {
      const t = toolRef.current;
      if (t === "cursor") return;
      const end = lastPtRef.current;
      if (t === "hline" && startRef.current) {
        void createDrawing({ type: "HORIZONTAL_LINE", geometry: { price: startRef.current.price } });
        reset();
        return;
      }
      const drag = dragRef.current;
      if (drag && end) {
        if (t === "trend") void createDrawing({ type: "TRENDLINE", geometry: { points: [drag.start, end] } });
        else if (t === "rect") void createDrawing({ type: "RECTANGLE", geometry: { points: [drag.start, end] } });
        else if (t === "freehand" && drag.path.length >= 2)
          void createDrawing({ type: "FREEHAND", geometry: { points: drag.path } });
      }
      reset();
    };
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, pair, timeframe]);

  // Esc cancela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hint =
    tool === "hline"
      ? "Click para fijar el precio · Esc cancela"
      : isDragTool(tool)
        ? "Arrastrá para dibujar · Esc cancela"
        : "";

  return (
    <>
      <DrawingToolbar active={tool} onSelect={setTool} onClear={clearAll} />
      {tool !== "cursor" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="text-[11px] px-2.5 py-1 rounded-md" style={{ background: "rgba(11,11,12,0.9)", color: GOLD }}>
            {hint}
          </span>
        </div>
      )}
    </>
  );
}
