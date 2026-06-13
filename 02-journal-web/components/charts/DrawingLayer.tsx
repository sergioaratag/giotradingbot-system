"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, UTCTimestamp } from "lightweight-charts";
import { DrawingToolbar } from "./DrawingToolbar";
import { DrawingFloatToolbar } from "./DrawingFloatToolbar";
import { DrawingsPrimitive } from "./drawings-primitive";
import {
  type Drawing,
  type Pt,
  type Tool,
  type LineStyle,
  isDragTool,
  hitHandle,
  hitBody,
  applyMove,
  applyResize,
  drawingBBox,
} from "@/lib/drawings";

const GOLD = "#C9A96E";

// Estado de una edición en curso (mover o redimensionar un dibujo).
type Edit = {
  id: string;
  mode: "move" | "resize";
  ix: number; // índice de handle (resize); -1 en move
  startPt: Pt; // punto (tiempo/precio) del crosshair al iniciar
  orig: Drawing; // snapshot con geometría original
  geom: Drawing["geometry"] | null; // última geometría previsualizada
  moved: boolean;
};

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
  // Mirror de la selección en state (para montar/renderizar el toolbar flotante).
  // La fuente de verdad durante el drag sigue siendo selectedIdRef (sin re-render).
  const [selId, setSelId] = useState<string | null>(null);
  const selDrawing = selId ? drawings.find((d) => d.id === selId) ?? null : null;

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const toolbarWrapRef = useRef<HTMLDivElement | null>(null);

  // Primitive singleton (no se recrea por render).
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  if (!primitiveRef.current) primitiveRef.current = new DrawingsPrimitive();

  // Estado de input (refs, no state → sin re-render por movimiento).
  const lastPtRef = useRef<Pt | null>(null); // tiempo/precio bajo el cursor
  const lastPxRef = useRef<{ x: number; y: number } | null>(null); // píxeles del cursor
  const dragRef = useRef<{ start: Pt; path: Pt[] } | null>(null);
  const startRef = useRef<Pt | null>(null);
  // Edición (selección + mover/redimensionar).
  const selectedIdRef = useRef<string | null>(null);
  const editRef = useRef<Edit | null>(null);

  // Conversores de coordenadas tiempo/precio → píxeles (espacio del pane).
  function coordFns() {
    if (!chart || !series) return null;
    const ts = chart.timeScale();
    return {
      toX: (t: number) => ts.timeToCoordinate(t as UTCTimestamp),
      toY: (p: number) => series.priceToCoordinate(p),
      W: ts.width(),
    };
  }

  function select(id: string | null) {
    selectedIdRef.current = id;
    primitiveRef.current?.setSelectedId(id);
    setSelId(id);
  }

  // Reposiciona el toolbar flotante sobre el bounding box del seleccionado.
  // geomOverride: durante una edición en vivo, usar la geometría previsualizada.
  function repositionToolbar(geomOverride?: Drawing["geometry"]) {
    const wrap = toolbarWrapRef.current;
    if (!wrap) return;
    const id = selectedIdRef.current;
    const base = id ? drawingsRef.current.find((d) => d.id === id) : null;
    const fns = coordFns();
    if (!id || !base || !fns) {
      wrap.style.visibility = "hidden";
      return;
    }
    const d = geomOverride ? { ...base, geometry: geomOverride } : base;
    const bb = drawingBBox(d, fns.toX, fns.toY, fns.W);
    const H = chart?.chartElement?.()?.clientHeight ?? 0;
    if (!bb || bb.maxY < 0 || bb.minY > H || bb.maxX < 0 || bb.minX > fns.W) {
      wrap.style.visibility = "hidden"; // fuera de vista
      return;
    }
    const cx = Math.min(Math.max((bb.minX + bb.maxX) / 2, 70), fns.W - 70);
    const GAP = 10;
    let top = bb.minY - GAP;
    let translateY = "-100%";
    if (top < 44) {
      top = bb.maxY + GAP; // no cabe arriba → debajo del dibujo
      translateY = "0";
    }
    wrap.style.left = `${cx}px`;
    wrap.style.top = `${top}px`;
    wrap.style.transform = `translate(-50%, ${translateY})`;
    wrap.style.visibility = "visible";
  }

  // Cambia estilo (color/grosor/lineStyle) en vivo + persiste (PATCH).
  function applyStyle(patch: Partial<Pick<Drawing, "color" | "width" | "lineStyle">>) {
    const id = selectedIdRef.current;
    if (!id) return;
    setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    void fetch(`/api/drawings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function deleteSelected() {
    const id = selectedIdRef.current;
    if (!id) return;
    select(null);
    setDrawings((prev) => prev.filter((d) => d.id !== id)); // optimista
    void fetch(`/api/drawings/${id}`, { method: "DELETE" });
  }

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
    editRef.current = null;
    select(null);
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

  // Reposicionar el toolbar flotante cuando cambia la selección o la geometría.
  useEffect(() => {
    repositionToolbar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, drawings]);

  // Seguir al dibujo en pan/zoom (cambia el rango visible).
  useEffect(() => {
    if (!chart) return;
    const ts = chart.timeScale();
    const onRange = () => repositionToolbar(editRef.current?.geom ?? undefined);
    ts.subscribeVisibleLogicalRangeChange(onRange);
    return () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart]);

  // Activo: avisar + cursor + bloquear scroll/scale mientras se dibuja.
  useEffect(() => {
    const active = tool !== "cursor";
    onActiveChange?.(active);
    const el = chart?.chartElement?.();
    if (el) el.style.cursor = active ? "crosshair" : "";
    chart?.applyOptions({ handleScroll: !active, handleScale: !active });
    // Cambiar de herramienta deselecciona.
    if (active) select(null);
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
    select(null);
    await Promise.all(drawingsRef.current.map((d) => fetch(`/api/drawings/${d.id}`, { method: "DELETE" })));
    await refetch();
  }
  // Persistir geometría tras mover/redimensionar (reusa PATCH existente).
  async function persistGeometry(id: string, geom: Drawing["geometry"]) {
    await fetch(`/api/drawings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry: geom }),
    });
    await refetch();
  }

  function reset() {
    dragRef.current = null;
    startRef.current = null;
    primitiveRef.current?.setPreview(null);
    setTool("cursor");
  }

  function startEdit(d: Drawing, mode: "move" | "resize", ix: number) {
    if (!lastPtRef.current) return;
    editRef.current = {
      id: d.id,
      mode,
      ix,
      startPt: { ...lastPtRef.current },
      orig: { ...d, geometry: JSON.parse(JSON.stringify(d.geometry)) },
      geom: null,
      moved: false,
    };
    // Bloquear pan/zoom mientras se edita.
    chart?.applyOptions({ handleScroll: false, handleScale: false });
  }

  // Crosshair → punto actual + preview en vivo (dibujo nuevo o edición).
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
      lastPxRef.current = { x: param.point.x, y: param.point.y };

      // 1) Edición en curso → recalcular geometría y previsualizar.
      const edit = editRef.current;
      if (edit) {
        let geom: Drawing["geometry"];
        if (edit.mode === "move") {
          const dt = pt.time - edit.startPt.time;
          const dp = pt.price - edit.startPt.price;
          if (dt !== 0 || dp !== 0) edit.moved = true;
          geom = applyMove(edit.orig, dt, dp);
        } else {
          edit.moved = true;
          geom = applyResize(edit.orig, edit.ix, pt);
        }
        edit.geom = geom;
        const edited = drawingsRef.current.map((d) => (d.id === edit.id ? { ...d, geometry: geom } : d));
        primitiveRef.current?.setDrawings(edited);
        repositionToolbar(geom); // la barra sigue al dibujo mientras se edita
        return;
      }

      // 2) Dibujo nuevo (herramienta activa) → preview del trazo.
      const drag = dragRef.current;
      const t = toolRef.current;
      if (drag) {
        if (t === "freehand") {
          drag.path.push(pt);
          primitiveRef.current?.setPreview({ tool: "freehand", points: drag.path });
        } else {
          primitiveRef.current?.setPreview({ tool: t, points: [drag.start, pt] });
        }
        return;
      }

      // 3) Modo cursor sin editar → feedback de cursor sobre dibujos.
      if (t === "cursor") {
        const fns = coordFns();
        const el = chart.chartElement?.();
        if (fns && el) {
          let cur = "";
          const selId = selectedIdRef.current;
          const sel = selId ? drawingsRef.current.find((d) => d.id === selId) : null;
          if (sel && hitHandle(sel, param.point.x, param.point.y, fns.toX, fns.toY, fns.W) != null) {
            cur = "pointer";
          } else if (drawingsRef.current.some((d) => hitBody(d, param.point!.x, param.point!.y, fns.toX, fns.toY, fns.W))) {
            cur = "move";
          }
          el.style.cursor = cur;
        }
        // Seguir al dibujo si se paneó el chart con el cursor.
        if (selectedIdRef.current) repositionToolbar();
      }
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series]);

  // mousedown / mouseup (coords vienen del crosshair → confiables).
  useEffect(() => {
    const el = chart?.chartElement?.();
    if (!el) return;

    const onDown = () => {
      const t = toolRef.current;

      // Modo cursor → seleccionar / iniciar edición.
      if (t === "cursor") {
        const px = lastPxRef.current;
        const fns = coordFns();
        if (!px || !fns) return;
        // a) Handle del dibujo ya seleccionado → resize.
        const selId = selectedIdRef.current;
        const sel = selId ? drawingsRef.current.find((d) => d.id === selId) : null;
        if (sel) {
          const hIx = hitHandle(sel, px.x, px.y, fns.toX, fns.toY, fns.W);
          if (hIx != null) {
            startEdit(sel, "resize", hIx);
            return;
          }
        }
        // b) Cuerpo de algún dibujo (de arriba hacia abajo) → seleccionar + mover.
        for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
          const d = drawingsRef.current[i];
          if (hitBody(d, px.x, px.y, fns.toX, fns.toY, fns.W)) {
            select(d.id);
            startEdit(d, "move", -1);
            return;
          }
        }
        // c) Zona vacía → deseleccionar.
        select(null);
        return;
      }

      // Herramienta de dibujo activa.
      const pt = lastPtRef.current;
      if (!pt) return;
      startRef.current = pt;
      if (isDragTool(t)) {
        dragRef.current = { start: pt, path: [pt] };
        primitiveRef.current?.setPreview({ tool: t, points: [pt] });
      }
    };

    const onUp = () => {
      // Fin de edición (mover/redimensionar).
      const edit = editRef.current;
      if (edit) {
        editRef.current = null;
        chart?.applyOptions({ handleScroll: true, handleScale: true });
        if (edit.moved && edit.geom) {
          void persistGeometry(edit.id, edit.geom);
        } else {
          // Click sin arrastrar → restaurar geometría del servidor.
          primitiveRef.current?.setDrawings(drawingsRef.current);
        }
        return;
      }

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

  // Teclado: Esc cancela/deselecciona, Delete/Backspace borra el seleccionado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Cancelar una edición en curso: restaurar geometría del servidor + pan/zoom.
        if (editRef.current) {
          editRef.current = null;
          chart?.applyOptions({ handleScroll: true, handleScale: true });
          primitiveRef.current?.setDrawings(drawingsRef.current);
        }
        reset();
        select(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
        if (!selectedIdRef.current || editRef.current) return;
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart]);

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
      {selDrawing && (
        <div ref={toolbarWrapRef} className="absolute z-30" style={{ left: 0, top: 0, visibility: "hidden" }}>
          <DrawingFloatToolbar
            drawing={selDrawing}
            onColor={(c) => applyStyle({ color: c })}
            onWidth={(w) => applyStyle({ width: w })}
            onStyle={(s: LineStyle) => applyStyle({ lineStyle: s })}
            onDelete={deleteSelected}
          />
        </div>
      )}
    </>
  );
}
