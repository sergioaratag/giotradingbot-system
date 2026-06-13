// PR #16 — Renderizado de dibujos del usuario con la Series Primitives API de
// Lightweight Charts v5. Dibuja sobre el CANVAS del chart (no overlay HTML), así
// que se mueve solo con pan/zoom y no intercepta clicks.
import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  IChartApi,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { Drawing, Pt, Tool } from "@/lib/drawings";
import { drawingHandleSpecs, handlePixel, resolveFont } from "@/lib/drawings";
import { hexToRgba } from "@/lib/chart-theme";

const PREVIEW_COLOR = "#e0b341";
const HANDLE_STROKE = "#2962ff"; // azul TradingView
const HANDLE_FILL = "#ffffff";
const HANDLE_SIZE = 8; // lado del cuadrito (px)

type Attached = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  requestUpdate: () => void;
};

class DrawingsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly p: DrawingsPrimitive) {}
  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace((scope) => {
      this.p.render(scope.context, scope.mediaSize.width, scope.mediaSize.height);
    });
  }
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private _att: Attached | null = null;
  private _drawings: Drawing[] = [];
  private _preview: { tool: Tool; points: Pt[] } | null = null;
  private _selectedId: string | null = null;
  private readonly _view: IPrimitivePaneView;

  constructor() {
    const self = this;
    this._view = {
      renderer(): IPrimitivePaneRenderer {
        return new DrawingsRenderer(self);
      },
    };
  }

  attached(p: SeriesAttachedParameter<Time>): void {
    this._att = {
      chart: p.chart as IChartApi,
      series: p.series as ISeriesApi<"Candlestick">,
      requestUpdate: p.requestUpdate,
    };
  }
  detached(): void {
    this._att = null;
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view];
  }
  updateAllViews(): void {
    /* sin estado por-vista */
  }

  setDrawings(d: Drawing[]): void {
    this._drawings = d;
    this._att?.requestUpdate();
  }
  setPreview(p: { tool: Tool; points: Pt[] } | null): void {
    this._preview = p;
    this._att?.requestUpdate();
  }
  setSelectedId(id: string | null): void {
    this._selectedId = id;
    this._att?.requestUpdate();
  }

  private xOf(time: number): number | null {
    return this._att ? this._att.chart.timeScale().timeToCoordinate(time as UTCTimestamp) : null;
  }
  private yOf(price: number): number | null {
    return this._att ? this._att.series.priceToCoordinate(price) : null;
  }

  render(c: CanvasRenderingContext2D, W: number, H: number): void {
    for (const d of this._drawings) {
      this.drawShape(c, W, H, d.type, d.geometry, d.color || PREVIEW_COLOR, false, d.width ?? 2, d.lineStyle ?? "SOLID");
      if (d.label && d.type !== "TEXT") this.drawLabel(c, d.label, d.color || PREVIEW_COLOR, d.geometry, d.type);
    }
    // Handles del dibujo seleccionado (modo edición).
    if (this._selectedId) {
      const sel = this._drawings.find((d) => d.id === this._selectedId);
      if (sel) this.drawHandles(c, W, sel);
    }
    const pv = this._preview;
    if (pv && pv.points.length) {
      const type =
        pv.tool === "hline"
          ? "HORIZONTAL_LINE"
          : pv.tool === "trend"
            ? "TRENDLINE"
            : pv.tool === "rect"
              ? "RECTANGLE"
              : pv.tool === "oval"
                ? "OVAL"
                : pv.tool === "freehand"
                  ? "FREEHAND"
                  : null;
      const minPts = type === "HORIZONTAL_LINE" ? 1 : 2;
      if (type && pv.points.length >= minPts) {
        const geom = type === "HORIZONTAL_LINE" ? { price: pv.points[0].price } : { points: pv.points };
        this.drawShape(c, W, H, type, geom, PREVIEW_COLOR, true, 2, "SOLID");
      }
      // puntos colocados (no para freehand, que son muchos).
      if (pv.tool !== "freehand") {
        for (const p of pv.points) {
          const x = this.xOf(p.time);
          const y = this.yOf(p.price);
          if (x != null && y != null) {
            c.beginPath();
            c.arc(x, y, 3.5, 0, Math.PI * 2);
            c.fillStyle = PREVIEW_COLOR;
            c.fill();
          }
        }
      }
    }
  }

  private drawHandles(c: CanvasRenderingContext2D, W: number, d: Drawing): void {
    const toX = (t: number) => this.xOf(t);
    const toY = (p: number) => this.yOf(p);
    c.save();
    c.lineWidth = 1.5;
    c.strokeStyle = HANDLE_STROKE;
    c.fillStyle = HANDLE_FILL;
    const half = HANDLE_SIZE / 2;
    for (const h of drawingHandleSpecs(d)) {
      const pos = handlePixel(h, toX, toY, W);
      if (!pos) continue;
      c.beginPath();
      c.rect(pos.x - half, pos.y - half, HANDLE_SIZE, HANDLE_SIZE);
      c.fill();
      c.stroke();
    }
    c.restore();
  }

  private fillOf(geom: Drawing["geometry"], borderColor: string) {
    const f = geom.fill;
    return {
      enabled: f?.enabled ?? true,
      color: f?.color ?? (borderColor.startsWith("#") ? borderColor : "#e0b341"),
      opacity: f?.opacity ?? 0.12,
    };
  }

  // Etiqueta opcional (columna label) sobre dibujos no-texto.
  private drawLabel(c: CanvasRenderingContext2D, label: string, color: string, geom: Drawing["geometry"], type: string): void {
    const a = this.labelAnchor(geom, type);
    if (!a) return;
    c.save();
    c.setLineDash([]);
    c.font = "600 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
    c.textBaseline = "bottom";
    c.textAlign = "left";
    c.fillStyle = color;
    c.fillText(label, a.x, a.y);
    c.restore();
  }

  private labelAnchor(geom: Drawing["geometry"], type: string): { x: number; y: number } | null {
    if (type === "HORIZONTAL_LINE" && geom.price != null) {
      const y = this.yOf(geom.price);
      return y != null ? { x: 8, y: y - 4 } : null;
    }
    if (geom.points?.length) {
      let best: { x: number; y: number } | null = null;
      for (const p of geom.points) {
        const x = this.xOf(p.time), y = this.yOf(p.price);
        if (x == null || y == null) continue;
        if (!best || y < best.y) best = { x, y };
      }
      return best ? { x: best.x, y: best.y - 4 } : null;
    }
    if (geom.time != null && geom.price != null) {
      const x = this.xOf(geom.time), y = this.yOf(geom.price);
      return x != null && y != null ? { x, y: y - 4 } : null;
    }
    return null;
  }

  private drawShape(
    c: CanvasRenderingContext2D,
    W: number,
    H: number,
    type: string,
    geom: Drawing["geometry"],
    color: string,
    preview: boolean,
    width: number,
    lineStyle: "SOLID" | "DASHED",
  ): void {
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    // Dash: preview siempre punteado; si no, según el estilo del dibujo.
    c.setLineDash(preview ? [5, 4] : lineStyle === "DASHED" ? [Math.max(5, width * 2.5), Math.max(4, width * 2)] : []);

    if (type === "HORIZONTAL_LINE" && geom.price != null) {
      const y = this.yOf(geom.price);
      if (y != null) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
      }
    } else if (type === "TRENDLINE" && geom.points?.length === 2) {
      const [a, b] = geom.points;
      const ax = this.xOf(a.time), ay = this.yOf(a.price), bx = this.xOf(b.time), by = this.yOf(b.price);
      if (ax != null && ay != null && bx != null && by != null) {
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
        c.stroke();
      }
    } else if (type === "RECTANGLE" && geom.points?.length === 2) {
      const [a, b] = geom.points;
      const ax = this.xOf(a.time), ay = this.yOf(a.price), bx = this.xOf(b.time), by = this.yOf(b.price);
      if (ax != null && ay != null && bx != null && by != null) {
        const x = Math.min(ax, bx), y = Math.min(ay, by), w = Math.abs(bx - ax), h = Math.abs(by - ay);
        const fl = this.fillOf(geom, color);
        if (fl.enabled) {
          c.fillStyle = hexToRgba(fl.color, fl.opacity);
          c.fillRect(x, y, w, h);
        }
        c.strokeRect(x, y, w, h);
      }
    } else if (type === "OVAL" && geom.points?.length === 2) {
      const [a, b] = geom.points;
      const ax = this.xOf(a.time), ay = this.yOf(a.price), bx = this.xOf(b.time), by = this.yOf(b.price);
      if (ax != null && ay != null && bx != null && by != null) {
        const cx = (ax + bx) / 2, cy = (ay + by) / 2;
        const rx = Math.abs(bx - ax) / 2, ry = Math.abs(by - ay) / 2;
        c.beginPath();
        c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        const fl = this.fillOf(geom, color);
        if (fl.enabled) {
          c.fillStyle = hexToRgba(fl.color, fl.opacity);
          c.fill();
        }
        c.stroke();
      }
    } else if (type === "TEXT" && geom.time != null && geom.price != null && geom.text) {
      const x = this.xOf(geom.time), y = this.yOf(geom.price);
      if (x != null && y != null) {
        const f = resolveFont(geom.font);
        c.setLineDash([]);
        c.font = `${f.italic ? "italic " : ""}${f.bold ? 700 : 400} ${f.size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        c.textBaseline = "middle";
        c.textAlign = f.align;
        c.fillStyle = color;
        c.fillText(geom.text, x, y);
      }
    } else if (type === "FREEHAND" && geom.points && geom.points.length >= 2) {
      c.lineJoin = "round";
      c.lineCap = "round";
      let started = false;
      c.beginPath();
      for (const p of geom.points) {
        const x = this.xOf(p.time);
        const y = this.yOf(p.price);
        if (x == null || y == null) continue;
        if (!started) {
          c.moveTo(x, y);
          started = true;
        } else {
          c.lineTo(x, y);
        }
      }
      if (started) c.stroke();
    }
    c.restore();
  }
}
