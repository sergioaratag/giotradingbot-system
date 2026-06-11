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
import { hexToRgba } from "@/lib/chart-theme";

const PREVIEW_COLOR = "#e0b341";

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

  private xOf(time: number): number | null {
    return this._att ? this._att.chart.timeScale().timeToCoordinate(time as UTCTimestamp) : null;
  }
  private yOf(price: number): number | null {
    return this._att ? this._att.series.priceToCoordinate(price) : null;
  }

  render(c: CanvasRenderingContext2D, W: number, H: number): void {
    for (const d of this._drawings) {
      this.drawShape(c, W, H, d.type, d.geometry, d.color || PREVIEW_COLOR, false);
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
              : pv.tool === "freehand"
                ? "FREEHAND"
                : null;
      const minPts = type === "HORIZONTAL_LINE" ? 1 : 2;
      if (type && pv.points.length >= minPts) {
        const geom = type === "HORIZONTAL_LINE" ? { price: pv.points[0].price } : { points: pv.points };
        this.drawShape(c, W, H, type, geom, PREVIEW_COLOR, true);
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

  private drawShape(
    c: CanvasRenderingContext2D,
    W: number,
    H: number,
    type: string,
    geom: Drawing["geometry"],
    color: string,
    preview: boolean,
  ): void {
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.setLineDash(preview ? [5, 4] : []);

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
        c.fillStyle = hexToRgba(color.startsWith("#") ? color : "#e0b341", 0.12);
        c.fillRect(x, y, w, h);
        c.strokeRect(x, y, w, h);
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
