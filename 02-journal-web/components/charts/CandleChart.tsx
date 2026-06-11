"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  createTextWatermark,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { BotStateRow } from "@/lib/bot-state";
import type { BotElement } from "@/lib/ict-modals";
import { killzoneWindowsForRange } from "@/lib/killzones";
import { type ChartTheme, DEFAULT_CHART_THEME, hexToRgba } from "@/lib/chart-theme";
import { DrawingLayer } from "./DrawingLayer";

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

// PR #14: formato de tiempo en español (dd MMM HH:mm) para crosshair/labels.
const TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function fmtTime(t: Time): string {
  const sec = typeof t === "number" ? t : 0;
  return TIME_FMT.format(new Date(sec * 1000));
}

export function CandleChart({
  pair,
  timeframe,
  botState,
  onElementClick,
  theme = DEFAULT_CHART_THEME,
}: {
  pair: "EURUSD" | "GBPUSD";
  timeframe: string;
  botState: BotStateRow | null;
  onElementClick: (el: BotElement) => void;
  theme?: ChartTheme;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const bidLineRef = useRef<IPriceLine | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [, bump] = useState(0); // fuerza recomputo del overlay en pan/zoom
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [, tick] = useState(0); // 1s ticker para "actualizado hace Xs"
  const [drawingActive, setDrawingActive] = useState(false);

  const rerenderOverlay = useCallback(() => bump((n) => n + 1), []);

  // Crear chart una vez.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      // PR #14: look TradingView dark.
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: "#d1d4dc",
        fontSize: 12,
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: theme.grid, style: LineStyle.Solid },
        horzLines: { color: theme.grid, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#758696", style: LineStyle.Dashed, labelBackgroundColor: "#9598a1" },
        horzLine: { color: "#758696", style: LineStyle.Dashed, labelBackgroundColor: "#9598a1" },
      },
      timeScale: {
        barSpacing: 12,
        minBarSpacing: 6,
        rightOffset: 12,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: true,
        borderVisible: true,
        borderColor: "#2a2e39",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        autoScale: true,
        mode: PriceScaleMode.Normal,
        alignLabels: true,
        borderVisible: true,
        borderColor: "#2a2e39",
        scaleMargins: { top: 0.1, bottom: 0.1 },
        entireTextOnly: true,
      },
      localization: { locale: "es-AR", timeFormatter: fmtTime },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: theme.candleUp,
      downColor: theme.candleDown,
      borderVisible: true,
      borderUpColor: theme.candleUp,
      borderDownColor: theme.candleDown,
      wickVisible: true,
      wickUpColor: theme.candleUp,
      wickDownColor: theme.candleDown,
      priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
    });
    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [{ text: "GioTradingBot", color: "rgba(180, 180, 180, 0.08)", fontSize: 60 }],
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []); // Fix 4: marcas de trades

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
      markersRef.current = null;
    };
    // theme solo da valores iniciales; los cambios los aplica el effect de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rerenderOverlay]);

  // PR #14: aplicar la paleta del usuario (fondo, grid, velas) cuando cambia.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: theme.background } },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
    });
    series.applyOptions({
      upColor: theme.candleUp,
      downColor: theme.candleDown,
      borderUpColor: theme.candleUp,
      borderDownColor: theme.candleDown,
      wickUpColor: theme.candleUp,
      wickDownColor: theme.candleDown,
    });
  }, [theme]);

  // Cargar velas al cambiar par/TF + polling cada 30s.
  useEffect(() => {
    let alive = true;
    let first = true;
    async function load() {
      if (first) setLoading(true);
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
        // PR #15: en el PRIMER load de cada par/TF, encuadrar las últimas ~80
        // velas (bodies anchos). Nunca en los refetch (no resetea zoom/pan del
        // usuario). Si hay menos de 80, fitContent como fallback.
        if (first) {
          const ts = chartRef.current?.timeScale();
          const total = data.candles.length;
          if (ts) {
            if (total >= 80) {
              ts.setVisibleLogicalRange({ from: (total - 80) as Logical, to: (total + 8) as Logical });
            } else {
              ts.fitContent();
            }
          }
        }
        if (alive) setLastUpdate(Date.now()); // Fix 3: marca de actualización
        rerenderOverlay();
      } catch {
        /* reintenta */
      } finally {
        if (alive) setLoading(false);
        first = false;
      }
    }
    load();
    // Fix 3: refetch cada 20s (el bot manda incrementales cada 60s).
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pair, timeframe, rerenderOverlay]);

  // Fix 3: ticker de 1s para mostrar "actualizado hace Xs".
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Bug #3: línea de precio bid en vivo (del BotState, que el page refresca cada 3s).
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const bid = botState?.currentBid ?? null;
    if (bid == null) {
      if (bidLineRef.current) {
        s.removePriceLine(bidLineRef.current);
        bidLineRef.current = null;
      }
      return;
    }
    if (bidLineRef.current) {
      bidLineRef.current.applyOptions({ price: bid, title: `Bid ${bid.toFixed(5)}` });
    } else {
      bidLineRef.current = s.createPriceLine({
        price: bid,
        color: "#a1a1aa",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Bid ${bid.toFixed(5)}`,
      });
    }
  }, [botState?.currentBid]);

  // Fix 4: marcas de los trades del bot del par (de la tabla Trade).
  useEffect(() => {
    let alive = true;
    async function loadTrades() {
      try {
        const res = await fetch(`/api/trades?pair=${pair}&source=BOT&limit=50`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const { trades } = (await res.json()) as {
          trades: { direction: "LONG" | "SHORT"; entryPrice: number; entryTime: string }[];
        };
        if (!alive || !markersRef.current) return;
        const markers: SeriesMarker<Time>[] = trades
          .map((t) => {
            const long = t.direction === "LONG";
            return {
              time: Math.floor(Date.parse(t.entryTime) / 1000) as Time,
              position: (long ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
              color: long ? UP : DOWN,
              shape: (long ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
              text: `${long ? "LONG" : "SHORT"} ${t.entryPrice.toFixed(5)}`,
            };
          })
          .sort((a, b) => (a.time as number) - (b.time as number));
        markersRef.current.setMarkers(markers);
      } catch {
        /* ignore */
      }
    }
    loadTrades();
    const id = setInterval(loadTrades, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pair]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <KillzoneZones chart={chartRef.current} size={size} theme={theme} />
      <BotOverlay
        chart={chartRef.current}
        series={seriesRef.current}
        size={size}
        botState={botState}
        onElementClick={onElementClick}
        interactive={!drawingActive}
      />
      <DrawingLayer
        chart={chartRef.current}
        series={seriesRef.current}
        size={size}
        pair={pair}
        timeframe={timeframe}
        onActiveChange={setDrawingActive}
      />
      <div className="absolute top-3 left-3 pointer-events-none">
        <span className="text-[11px] text-cream-muted px-2.5 py-1 rounded-md inline-flex items-center gap-1.5" style={{ background: "rgba(11,11,12,0.85)" }}>
          <span
            className={`w-1.5 h-1.5 rounded-full ${loading ? "animate-pulse" : ""}`}
            style={{ background: loading ? "var(--color-rose)" : "var(--color-profit-bright)" }}
          />
          {loading
            ? `Cargando ${pair} ${timeframe}…`
            : lastUpdate
              ? `Actualizado hace ${Math.max(0, Math.round((Date.now() - lastUpdate) / 1000))}s`
              : `${pair} ${timeframe}`}
        </span>
      </div>
      {!loading && empty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-mute px-6 py-3 rounded-md text-center" style={{ background: "rgba(11,11,12,0.8)" }}>
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
  interactive,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  size: { w: number; h: number };
  botState: BotStateRow | null;
  onElementClick: (el: BotElement) => void;
  interactive: boolean;
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
  // Mientras se dibuja, el overlay del bot no intercepta clicks (van al chart).
  const gCls = interactive ? "pointer-events-auto cursor-pointer" : "pointer-events-none";

  const fvgs = botState.fvgs ?? [];
  const sweeps = botState.sweeps ?? [];
  const markers = (botState.markers ?? []).filter((m) => m.type === "CHOCH");

  return (
    <svg className="absolute inset-0 pointer-events-none" width={W} height={H}>
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
          <g key={`fvg-${i}`} className={gCls} onClick={() => onElementClick({ kind: "FVG", fvg: f })}>
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
          <g key={`sw-${i}`} className={gCls} onClick={() => onElementClick({ kind: "SWEEP", sweep: s })}>
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
          <g key={`ch-${i}`} className={gCls} onClick={() => onElementClick({ kind: "CHOCH", marker: m })}>
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

// Feature 1 (6B): bandas de killzones (Londres/NY AM/NY Lunch) en el rango
// visible, en todos los timeframes. DST-correcto vía lib/killzones.
function KillzoneZones({ chart, size, theme }: { chart: IChartApi | null; size: { w: number; h: number }; theme: ChartTheme }) {
  if (!chart || size.w === 0) return null;
  const range = chart.timeScale().getVisibleRange();
  if (!range) return null;
  const from = range.from as UTCTimestamp;
  const to = range.to as UTCTimestamp;
  const bands = killzoneWindowsForRange(from, to);
  const W = size.w;
  const H = size.h;
  const xAt = (t: number) => chart.timeScale().timeToCoordinate(t as UTCTimestamp);
  const colorFor = (id: string) =>
    id === "LDN" ? theme.kzLondon : id === "NY_AM" ? theme.kzNyAm : theme.kzNyLunch;

  return (
    <svg className="absolute inset-0 pointer-events-none" width={W} height={H}>
      {bands.map((b, i) => {
        const x1 = xAt(b.start);
        const x2 = xAt(b.end);
        const left = Math.max(0, Math.min(x1 ?? 0, x2 ?? W));
        const right = Math.min(W, Math.max(x1 ?? 0, x2 ?? W));
        if (right <= left) return null;
        const c = colorFor(b.id);
        return (
          <g key={`kz-${i}`}>
            <rect x={left} y={0} width={right - left} height={H} fill={hexToRgba(c, 0.08)} stroke={hexToRgba(c, 0.4)} strokeWidth={0} />
            <line x1={left} y1={0} x2={right} y2={0} stroke={hexToRgba(c, 0.4)} strokeWidth={1.5} />
            {right - left > 46 && (
              <text x={left + 6} y={14} fill={hexToRgba(c, 0.6)} fontSize={10} style={{ letterSpacing: "0.03em" }}>
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
