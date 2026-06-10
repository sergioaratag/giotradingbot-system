"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { BotStateRow } from "@/lib/bot-state";
import type { BotElement } from "@/lib/ict-modals";
import { killzoneWindowUnix } from "@/lib/killzones";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const UP = "#34d399";
const DOWN = "#f87171";

export function CandleChart({
  pair,
  timeframe,
  botState,
  onElementClick,
}: {
  pair: "EURUSD" | "GBPUSD";
  timeframe: string;
  botState: BotStateRow | null;
  onElementClick: (el: BotElement) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [, bump] = useState(0); // fuerza recomputo del overlay en pan/zoom
  const [empty, setEmpty] = useState(false);

  const rerenderOverlay = useCallback(() => bump((n) => n + 1), []);

  // Crear chart una vez.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0b0c" },
        textColor: "#8a8a90",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(63,63,70,0.25)" },
        horzLines: { color: "rgba(63,63,70,0.25)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#3f3f46" },
      rightPriceScale: { borderColor: "#3f3f46" },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    chart.timeScale().subscribeVisibleLogicalRangeChange(rerenderOverlay);

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
      rerenderOverlay();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [rerenderOverlay]);

  // Cargar velas al cambiar par/TF + polling cada 30s.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/candles?pair=${pair}&timeframe=${timeframe}&limit=300`, {
          cache: "no-store",
        });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { candles: Candle[] };
        if (!alive) return;
        setEmpty(data.candles.length === 0);
        seriesRef.current?.setData(
          data.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        rerenderOverlay();
      } catch {
        /* reintenta */
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pair, timeframe, rerenderOverlay]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <BotOverlay
        chart={chartRef.current}
        series={seriesRef.current}
        size={size}
        botState={botState}
        onElementClick={onElementClick}
      />
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-mute px-6 py-3 rounded-md" style={{ background: "rgba(11,11,12,0.8)" }}>
            Sin velas para {pair} {timeframe}. Llegan cuando el EA (recompilado con CandleReporter) las envía.
          </p>
        </div>
      )}
    </div>
  );
}

function BotOverlay({
  chart,
  series,
  size,
  botState,
  onElementClick,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  size: { w: number; h: number };
  botState: BotStateRow | null;
  onElementClick: (el: BotElement) => void;
}) {
  if (!chart || !series || !botState || size.w === 0) return null;

  const yFor = (price?: number): number | null =>
    price == null ? null : series.priceToCoordinate(price);
  const xForIso = (iso?: string): number | null => {
    if (!iso) return null;
    const t = Math.floor(Date.parse(iso) / 1000);
    if (Number.isNaN(t)) return null;
    return chart.timeScale().timeToCoordinate(t as Time);
  };
  const W = size.w;
  const H = size.h;

  const fvgs = botState.fvgs ?? [];
  const sweeps = botState.sweeps ?? [];
  const markers = (botState.markers ?? []).filter((m) => m.type === "CHOCH");

  const nowUnix = Math.floor(Date.now() / 1000);
  const kzWin = killzoneWindowUnix(botState.killzone, nowUnix);

  return (
    <svg className="absolute inset-0 pointer-events-none" width={W} height={H}>
      {/* Killzone — banda de fondo */}
      {kzWin &&
        (() => {
          const x1 = chart.timeScale().timeToCoordinate(kzWin.start as Time) ?? 0;
          const x2 = chart.timeScale().timeToCoordinate(kzWin.end as Time) ?? W;
          const left = Math.max(0, Math.min(x1, x2));
          const right = Math.min(W, Math.max(x1, x2));
          if (right <= left) return null;
          return (
            <g className="pointer-events-auto cursor-pointer" onClick={() => onElementClick({ kind: "KILLZONE", name: botState.killzone })}>
              <rect x={left} y={0} width={right - left} height={H} fill="rgba(201,169,110,0.06)" stroke="rgba(201,169,110,0.25)" strokeDasharray="4 4" />
            </g>
          );
        })()}

      {/* FVGs — rectángulos */}
      {fvgs.map((f, i) => {
        const yT = yFor(f.top);
        const yB = yFor(f.bot);
        const x = xForIso(f.formedAt);
        if (yT == null || yB == null) return null;
        const left = x == null ? 0 : Math.max(0, x);
        const bull = f.side === "BULL";
        const color = bull ? UP : DOWN;
        const y = Math.min(yT, yB);
        const h = Math.abs(yT - yB);
        return (
          <g key={`fvg-${i}`} className="pointer-events-auto cursor-pointer" onClick={() => onElementClick({ kind: "FVG", fvg: f })}>
            <rect x={left} y={y} width={W - left} height={Math.max(2, h)} fill={bull ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)"} stroke={color} strokeWidth={1} />
            <text x={left + 6} y={y - 4} fill={color} fontSize={10} fontWeight={500}>
              FVG {bull ? "Alcista" : "Bajista"} {f.top?.toFixed(5)} · Q{f.quality}/10
            </text>
          </g>
        );
      })}

      {/* Sweeps — líneas horizontales */}
      {sweeps.map((s, i) => {
        const y = yFor(s.price);
        if (y == null) return null;
        const x = xForIso(s.detectedAt);
        const left = x == null ? 0 : Math.max(0, x);
        return (
          <g key={`sw-${i}`} className="pointer-events-auto cursor-pointer" onClick={() => onElementClick({ kind: "SWEEP", sweep: s })}>
            <line x1={left} y1={y} x2={W} y2={y} stroke="#C9A96E" strokeWidth={1.5} strokeDasharray="6 3" />
            <text x={left + 6} y={y - 4} fill="#C9A96E" fontSize={10}>
              Sweep {s.level} {s.price != null ? `@ ${s.price.toFixed(5)}` : ""}
            </text>
          </g>
        );
      })}

      {/* CHoCH — marca */}
      {markers.map((m, i) => {
        const y = yFor(m.price);
        const x = xForIso(m.time);
        if (y == null || x == null) return null;
        return (
          <g key={`ch-${i}`} className="pointer-events-auto cursor-pointer" onClick={() => onElementClick({ kind: "CHOCH", marker: m })}>
            <circle cx={x} cy={y} r={5} fill="#a855f7" />
            <text x={x + 10} y={y + 3} fill="#a855f7" fontSize={10}>
              CHoCH {m.price != null ? `@ ${m.price.toFixed(5)}` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
