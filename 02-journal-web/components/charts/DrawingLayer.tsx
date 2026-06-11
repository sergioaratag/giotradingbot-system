"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams } from "lightweight-charts";
import { DrawingToolbar } from "./DrawingToolbar";
import { DrawingsPrimitive } from "./drawings-primitive";
import { type Drawing, type Pt, type Tool, TOOL_CLICKS } from "@/lib/drawings";

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
  const [pending, setPending] = useState<Pt[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);

  // Crear + attachar el primitive a la serie (render sobre el canvas del chart).
  useEffect(() => {
    if (!series) return;
    const prim = new DrawingsPrimitive();
    series.attachPrimitive(prim);
    primitiveRef.current = prim;
    prim.setDrawings(drawingsRef.current); // empujar lo ya cargado (timing)
    return () => {
      series.detachPrimitive(prim);
      primitiveRef.current = null;
    };
  }, [series]);

  // Cargar dibujos del usuario para ESTE par+TF.
  useEffect(() => {
    let alive = true;
    setPending([]);
    setTool("cursor");
    fetch(`/api/drawings?pair=${pair}&timeframe=${timeframe}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { drawings: [] }))
      .then((d) => {
        if (alive) setDrawings(d.drawings ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pair, timeframe]);

  // Empujar dibujos + preview al primitive cuando cambian.
  useEffect(() => {
    primitiveRef.current?.setDrawings(drawings);
  }, [drawings]);
  useEffect(() => {
    primitiveRef.current?.setPreview(tool !== "cursor" ? { tool, points: pending } : null);
  }, [tool, pending]);

  // Avisar al chart cuándo se está dibujando (para que el overlay del bot no
  // intercepte clicks) + cursor crosshair.
  useEffect(() => {
    onActiveChange?.(tool !== "cursor");
    const el = chart?.chartElement?.();
    if (el) el.style.cursor = tool !== "cursor" ? "crosshair" : "";
  }, [tool, chart, onActiveChange]);

  async function refetch() {
    const r = await fetch(`/api/drawings?pair=${pair}&timeframe=${timeframe}`, { cache: "no-store" });
    if (r.ok) setDrawings((await r.json()).drawings ?? []);
  }

  async function createDrawing(body: Record<string, unknown>) {
    await fetch("/api/drawings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, timeframe, color: GOLD, ...body }),
    });
    await refetch();
  }

  async function clearAll() {
    await Promise.all(drawings.map((d) => fetch(`/api/drawings/${d.id}`, { method: "DELETE" })));
    await refetch();
  }

  // Input: subscribeClick (registrado una vez por chart; lee tool/pending de refs).
  useEffect(() => {
    if (!chart || !series) return;
    const handler = (param: MouseEventParams) => {
      const t = toolRef.current;
      if (t === "cursor" || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      let time: number | null = param.time != null ? Number(param.time) : null;
      if (time == null) {
        const ct = chart.timeScale().coordinateToTime(param.point.x);
        time = ct != null ? Number(ct) : null;
      }
      if (price == null || time == null) return;
      const pts = [...pendingRef.current, { time, price }];
      if (pts.length < TOOL_CLICKS[t]) {
        setPending(pts);
        return;
      }
      if (t === "hline") void createDrawing({ type: "HORIZONTAL_LINE", geometry: { price: pts[0].price } });
      else if (t === "trend") void createDrawing({ type: "TRENDLINE", geometry: { points: pts } });
      else if (t === "rect") void createDrawing({ type: "RECTANGLE", geometry: { points: pts } });
      setPending([]);
      setTool("cursor");
    };
    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, pair, timeframe]);

  // Esc cancela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTool("cursor");
        setPending([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <DrawingToolbar active={tool} onSelect={setTool} onClear={clearAll} />
      {tool !== "cursor" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="text-[11px] px-2.5 py-1 rounded-md" style={{ background: "rgba(11,11,12,0.9)", color: GOLD }}>
            {`Click ${pending.length + 1}/${TOOL_CLICKS[tool]} · Esc cancela`}
          </span>
        </div>
      )}
    </>
  );
}
