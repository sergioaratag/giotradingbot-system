// Fase 5 — Tipos del estado vivo del bot (lo que devuelve GET /api/bot/state).

export type FvgState = {
  tf?: string; // "M5" | "M3" | "H1" ...
  side?: string; // "BULL" | "BEAR"
  top?: number;
  bot?: number;
  quality?: number; // 1-10
  state?: string; // "ACTIVE" | "MITIGATING" | "IFVG"
  formedAt?: string; // ISO UTC — para posicionar en el chart
};

export type SweepState = {
  tf?: string;
  level?: string; // tipo del nivel: "PDH" | "EQH" | "LIQ_LONDON_H" ...
  price?: number; // precio exacto del nivel barrido
  type?: string; // dirección del sweep
  detectedAt?: string; // ISO UTC
};

export type BotMarker = {
  type?: string; // "CHOCH" | "TRADE" | "SL" | "TP"
  price?: number;
  time?: string; // ISO UTC
  label?: string;
  tf?: string;
};

export type BotStateRow = {
  id: string;
  symbol: string;
  updatedAt: string;
  biasH4: string | null;
  biasD1: string | null;
  killzone: string | null;
  currentBid: number | null;
  currentAsk: number | null;
  fvgs: FvgState[];
  sweeps: SweepState[];
  markers: BotMarker[];
  chochState: string | null;
  currentAction: string | null;
  reasoning: string | null;
  nextStep: string | null;
};

// ─────────────────────────── Lecciones ICT contextuales ───────────────────────

export type LessonPhase =
  | "scanning_sweeps"
  | "waiting_fvg"
  | "waiting_choch"
  | "validating_bias"
  | "trade_opened"
  | "idle";

export const ICT_LESSONS: Record<LessonPhase, { title: string; body: string }> = {
  idle: {
    title: "Fuera de killzone",
    body: "El bot solo opera dentro de las killzones (Londres, NY AM, NY Lunch), donde la liquidez institucional es máxima. Fuera de ellas espera: la probabilidad de movimientos limpios cae mucho.",
  },
  scanning_sweeps: {
    title: "¿Qué es un Sweep de Liquidez?",
    body: "Un sweep es cuando el precio toma stops acumulados encima de un high o debajo de un low importante, y luego se revierte. ICT lo considera manipulación institucional para acumular liquidez antes del movimiento real. El bot escanea estos barridos como gatillo del setup.",
  },
  waiting_fvg: {
    title: "¿Qué es un Fair Value Gap?",
    body: "El FVG es un imbalance de 3 velas donde la vela del medio deja un vacío entre las sombras de la 1 y la 3. El precio tiende a volver a mitigar ese vacío. El bot busca un FVG (M5/M3) que coincida con el sweep recién detectado para definir la zona de entrada.",
  },
  waiting_choch: {
    title: "¿Qué es un CHoCH?",
    body: "Change of Character: el primer high inferior (en bear) o low superior (en bull) que invalida la tendencia previa. Confirma que el sweep fue manipulación real y que el mercado va a girar. Es la confirmación que el bot espera tras el FVG.",
  },
  validating_bias: {
    title: "Bias HTF — ¿por qué importa?",
    body: "El bias del timeframe alto (H4/D1) define la dirección preferente del día. El bot solo abre trades alineados con el bias HTF; eso filtra la mayoría de los setups malos antes de arriesgar capital.",
  },
  trade_opened: {
    title: "Trade abierto — ¿y ahora?",
    body: "El bot gestiona el trade solo: trailing escalonado por múltiplos de R, mueve SL a BE al llegar a 1R y va asegurando. No hay que tocar nada manualmente.",
  },
};

// Infiere la fase didáctica a partir del texto de la acción actual del bot.
export function inferPhase(action: string | null | undefined): LessonPhase {
  const a = (action ?? "").toLowerCase();
  if (!a) return "idle";
  if (a.includes("abriendo") || a.includes("trade") || a.includes("abierto")) return "trade_opened";
  if (a.includes("bias") || a.includes("validando")) return "validating_bias";
  if (a.includes("choch")) return "waiting_choch";
  if (a.includes("fvg")) return "waiting_fvg";
  if (a.includes("sweep") || a.includes("escaneando") || a.includes("liquidez")) return "scanning_sweeps";
  if (a.includes("killzone") || a.includes("aguardando") || a.includes("fuera")) return "idle";
  return "scanning_sweeps";
}
