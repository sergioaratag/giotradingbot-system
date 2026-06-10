// Fase 6 — Contenido didáctico de los modales que se abren al clickear un
// elemento del bot (FVG, sweep, CHoCH, killzone, bias). Todo en español.
import type { FvgState, SweepState, BotMarker } from "@/lib/bot-state";
import { killzoneLabelEs } from "@/lib/killzones";

export type BotElement =
  | { kind: "FVG"; fvg: FvgState }
  | { kind: "SWEEP"; sweep: SweepState }
  | { kind: "CHOCH"; marker: BotMarker }
  | { kind: "KILLZONE"; name: string | null }
  | { kind: "BIAS"; bias: string | null; tf: string };

export type ModalContent = {
  title: string;
  explanation: string;
  data: { label: string; value: string }[];
  tip: string;
};

const fmt = (n: number | undefined, dp = 5) => (n == null ? "—" : n.toFixed(dp));
const pips = (a?: number, b?: number) =>
  a == null || b == null ? "—" : `${(Math.abs(a - b) * 10000).toFixed(1)} pips`;
const sideEs = (s?: string) => (s === "BULL" || s === "BULLISH" ? "Alcista" : "Bajista");
const fvgStateEs = (s?: string) =>
  s === "MITIGATING" ? "Mitigándose" : s === "IFVG" ? "Invertido (IFVG)" : "Activo";
const dt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-BO", { hour12: false }) : "—";

export function modalContent(el: BotElement): ModalContent {
  switch (el.kind) {
    case "FVG": {
      const f = el.fvg;
      return {
        title: `Fair Value Gap ${sideEs(f.side)}`,
        explanation:
          "Un Fair Value Gap (FVG) es un imbalance de 3 velas donde la vela del medio deja un vacío entre las sombras de la vela 1 y la 3. El precio tiende a regresar para mitigarlo.",
        data: [
          { label: "Precio superior", value: fmt(f.top) },
          { label: "Precio inferior", value: fmt(f.bot) },
          { label: "Tamaño", value: pips(f.top, f.bot) },
          { label: "Timeframe", value: f.tf ?? "—" },
          { label: "Calidad", value: f.quality != null ? `${f.quality}/10` : "—" },
          { label: "Estado", value: fvgStateEs(f.state) },
        ],
        tip: "El bot busca FVGs en M5/M3 que coincidan con un sweep reciente. Cuando el precio retorna y mitiga el FVG, suele reaccionar en dirección del bias del timeframe alto.",
      };
    }
    case "SWEEP": {
      const s = el.sweep;
      return {
        title: `Sweep de Liquidez · ${s.level ?? ""}`,
        explanation:
          "Un sweep es cuando el precio barre los stops acumulados por encima de un high o por debajo de un low importante, y luego se revierte. ICT lo lee como manipulación institucional para acumular liquidez antes del movimiento real.",
        data: [
          { label: "Nivel barrido", value: s.level ?? "—" },
          { label: "Precio", value: fmt(s.price) },
          { label: "Timeframe", value: s.tf ?? "—" },
          { label: "Detectado", value: dt(s.detectedAt) },
        ],
        tip: "Un sweep es el gatillo del setup del bot: tras el barrido, busca un FVG en timeframe bajo que defina la zona de entrada.",
      };
    }
    case "CHOCH": {
      const m = el.marker;
      return {
        title: "Change of Character (CHoCH)",
        explanation:
          "El CHoCH es el primer high inferior (en bajista) o low superior (en alcista) que invalida la tendencia previa. Confirma que el sweep fue manipulación real y que el mercado va a girar.",
        data: [
          { label: "Precio", value: fmt(m.price) },
          { label: "Timeframe", value: m.tf ?? "—" },
          { label: "Confirmado", value: dt(m.time) },
        ],
        tip: "El CHoCH es la confirmación que el bot espera tras el FVG. Con sweep + FVG + CHoCH alineados al bias, el setup queda válido.",
      };
    }
    case "KILLZONE":
      return {
        title: killzoneLabelEs(el.name),
        explanation:
          "Las killzones son ventanas horarias de máxima liquidez institucional (Londres, NY AM, NY Lunch). El bot solo opera dentro de ellas: fuera, la probabilidad de movimientos limpios cae mucho.",
        data: [{ label: "Killzone", value: el.name ?? "—" }],
        tip: "Dentro de la killzone, el bot escanea sweeps → FVG → CHoCH. Fuera, espera.",
      };
    case "BIAS": {
      const dir = el.bias === "BULLISH" ? "Alcista" : el.bias === "BEARISH" ? "Bajista" : "Neutral";
      return {
        title: `Bias ${el.tf} · ${dir}`,
        explanation:
          "El bias del timeframe alto (H4/D1) define la dirección preferente del día. El bot solo abre operaciones alineadas con él; esto filtra la mayoría de los setups malos.",
        data: [
          { label: "Timeframe", value: el.tf },
          { label: "Dirección", value: dir },
        ],
        tip: "Si un setup va en contra del bias HTF, el bot lo descarta aunque tenga sweep + FVG + CHoCH.",
      };
    }
  }
}
