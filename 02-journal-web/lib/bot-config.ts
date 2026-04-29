export type BotConfigGroup = "risk" | "detection" | "filters" | "tp_sizing" | "switches";

export type BotConfigSpec = {
  key: string;
  label: string;
  description: string;
  group: BotConfigGroup;
  type: "number" | "boolean" | "string";
  default: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export const BOT_CONFIG_SPECS: BotConfigSpec[] = [
  // ───── Riesgo ─────
  {
    key: "MaxDailyLossPct",
    label: "Pérdida diaria máxima",
    description: "Porcentaje del balance que detiene el bot ese día.",
    group: "risk",
    type: "number",
    default: "1.5",
    min: 0.1,
    max: 5,
    step: 0.1,
    unit: "%",
  },
  {
    key: "MaxStopLossPips",
    label: "SL máximo aceptable",
    description: "Si el SL del setup excede esto, se descarta.",
    group: "risk",
    type: "number",
    default: "25",
    min: 5,
    max: 100,
    step: 1,
    unit: "pips",
  },
  {
    key: "RiskHighQuality",
    label: "Riesgo calidad alta",
    description: "% del balance arriesgado en setups A+.",
    group: "risk",
    type: "number",
    default: "1.5",
    min: 0.1,
    max: 3,
    step: 0.1,
    unit: "%",
  },
  {
    key: "RiskMediumQuality",
    label: "Riesgo calidad media",
    description: "% del balance arriesgado en setups B.",
    group: "risk",
    type: "number",
    default: "1.0",
    min: 0.1,
    max: 2,
    step: 0.1,
    unit: "%",
  },
  {
    key: "RiskLowQuality",
    label: "Riesgo calidad baja",
    description: "% del balance arriesgado en setups C.",
    group: "risk",
    type: "number",
    default: "0.5",
    min: 0.1,
    max: 1.5,
    step: 0.1,
    unit: "%",
  },

  // ───── Detección ─────
  {
    key: "SLBufferPips",
    label: "Buffer del SL",
    description: "Pips por encima/debajo del sweep para colocar el SL.",
    group: "detection",
    type: "number",
    default: "3",
    min: 0,
    max: 10,
    step: 0.5,
    unit: "pips",
  },
  {
    key: "MinFVGSizePips",
    label: "Tamaño mínimo del FVG",
    description: "FVGs por debajo de esto se consideran ruido.",
    group: "detection",
    type: "number",
    default: "1.5",
    min: 0.5,
    max: 10,
    step: 0.5,
    unit: "pips",
  },
  {
    key: "ChochWindowMinutes",
    label: "Ventana CHoCH",
    description: "Minutos tras el sweep para esperar CHoCH.",
    group: "detection",
    type: "number",
    default: "45",
    min: 5,
    max: 180,
    step: 5,
    unit: "min",
  },
  {
    key: "LimitOrderValidityMinutes",
    label: "Validez de orden límite",
    description: "Cuánto se mantiene viva una orden no ejecutada.",
    group: "detection",
    type: "number",
    default: "30",
    min: 5,
    max: 180,
    step: 5,
    unit: "min",
  },

  // ───── Filtros ─────
  {
    key: "MaxSpreadEurUsd",
    label: "Spread máximo EUR/USD",
    description: "Si está más alto al entrar, se cancela.",
    group: "filters",
    type: "number",
    default: "1.5",
    min: 0.5,
    max: 5,
    step: 0.1,
    unit: "pips",
  },
  {
    key: "MaxSpreadGbpUsd",
    label: "Spread máximo GBP/USD",
    description: "Si está más alto al entrar, se cancela.",
    group: "filters",
    type: "number",
    default: "2.0",
    min: 0.5,
    max: 6,
    step: 0.1,
    unit: "pips",
  },
  {
    key: "MinAtrEurUsd",
    label: "ATR mínimo H1 EUR/USD",
    description: "Bajo este ATR el mercado se considera muerto.",
    group: "filters",
    type: "number",
    default: "8",
    min: 1,
    max: 50,
    step: 0.5,
    unit: "pips",
  },
  {
    key: "MinAtrGbpUsd",
    label: "ATR mínimo H1 GBP/USD",
    description: "Bajo este ATR el mercado se considera muerto.",
    group: "filters",
    type: "number",
    default: "10",
    min: 1,
    max: 60,
    step: 0.5,
    unit: "pips",
  },
  {
    key: "NewsBlockMinutesBefore",
    label: "Bloqueo previo a noticia",
    description: "Minutos antes de una noticia HIGH en que el bot no abre.",
    group: "filters",
    type: "number",
    default: "30",
    min: 0,
    max: 120,
    step: 5,
    unit: "min",
  },
  {
    key: "NewsBlockMinutesAfter",
    label: "Bloqueo posterior a noticia",
    description: "Minutos después de la noticia en que el bot espera.",
    group: "filters",
    type: "number",
    default: "30",
    min: 0,
    max: 120,
    step: 5,
    unit: "min",
  },

  // ───── TP / Sizing ─────
  {
    key: "TP1RR",
    label: "RR para TP1",
    description: "Multiplicador R en el primer take profit.",
    group: "tp_sizing",
    type: "number",
    default: "1.5",
    min: 0.5,
    max: 5,
    step: 0.1,
  },
  {
    key: "TP1ClosePct",
    label: "% a cerrar en TP1",
    description: "Porcentaje de la posición que se cierra en TP1.",
    group: "tp_sizing",
    type: "number",
    default: "50",
    min: 10,
    max: 100,
    step: 5,
    unit: "%",
  },
  {
    key: "TP2RR",
    label: "RR mínimo para TP2",
    description: "Multiplicador R en el segundo take profit.",
    group: "tp_sizing",
    type: "number",
    default: "3.0",
    min: 1,
    max: 10,
    step: 0.1,
  },
  {
    key: "TP2ClosePct",
    label: "% a cerrar en TP2",
    description: "Porcentaje de la posición que se cierra en TP2.",
    group: "tp_sizing",
    type: "number",
    default: "30",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
  },
  {
    key: "MinRRRequired",
    label: "RR mínimo del setup",
    description: "Si el setup no llega a este RR, se descarta.",
    group: "tp_sizing",
    type: "number",
    default: "2.0",
    min: 1,
    max: 5,
    step: 0.1,
  },
  {
    key: "BiasMultiplier",
    label: "Multiplicador contra bias",
    description: "Reduce tamaño si el setup va contra el bias HTF.",
    group: "tp_sizing",
    type: "number",
    default: "0.5",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: "KillzoneMultiplier",
    label: "Multiplicador en killzone",
    description: "Multiplicador de tamaño dentro de killzone válida.",
    group: "tp_sizing",
    type: "number",
    default: "1.0",
    min: 0.5,
    max: 2,
    step: 0.05,
  },
  {
    key: "OutKillzoneMultiplier",
    label: "Multiplicador fuera killzone",
    description: "Multiplicador de tamaño fuera de killzone.",
    group: "tp_sizing",
    type: "number",
    default: "0.75",
    min: 0,
    max: 1,
    step: 0.05,
  },

  // ───── Switches ─────
  {
    key: "BotEnabled",
    label: "Bot activo",
    description: "Si el bot toma trades nuevos.",
    group: "switches",
    type: "boolean",
    default: "false",
  },
  {
    key: "BotKillSwitch",
    label: "Kill switch",
    description: "Override total — el bot se detiene y cierra posiciones.",
    group: "switches",
    type: "boolean",
    default: "false",
  },
];

export const BOT_CONFIG_GROUPS: { key: BotConfigGroup; label: string }[] = [
  { key: "risk", label: "Riesgo" },
  { key: "detection", label: "Detección" },
  { key: "filters", label: "Filtros" },
  { key: "tp_sizing", label: "TP / Sizing" },
];

export function getSpec(key: string): BotConfigSpec | undefined {
  return BOT_CONFIG_SPECS.find((s) => s.key === key);
}

export function isValidValue(spec: BotConfigSpec, raw: string): boolean {
  if (spec.type === "boolean") {
    return raw === "true" || raw === "false";
  }
  if (spec.type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return false;
    if (spec.min !== undefined && n < spec.min) return false;
    if (spec.max !== undefined && n > spec.max) return false;
    return true;
  }
  return raw.length <= 4096;
}
