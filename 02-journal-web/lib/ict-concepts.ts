export type ICTCategory =
  | "liquidity"
  | "manipulation"
  | "structure"
  | "imbalance"
  | "orderblock"
  | "premium-discount"
  | "killzone"
  | "special";

export interface ICTConcept {
  key: string;
  label: string;
  category: ICTCategory;
  description: string;
  iconType: "svg-component";
}

export const ICT_CATEGORIES: Record<
  ICTCategory,
  { label: string; description: string }
> = {
  liquidity: {
    label: "Liquidez",
    description: "Niveles donde se acumulan stops y órdenes pendientes",
  },
  manipulation: {
    label: "Manipulación",
    description: "Movimientos que cazan liquidez antes de revertir",
  },
  structure: {
    label: "Estructura",
    description: "Cambios y rupturas en la estructura de mercado",
  },
  imbalance: {
    label: "Imbalance / FVG",
    description: "Desbalances de precio que el mercado tiende a llenar",
  },
  orderblock: {
    label: "Order Blocks",
    description: "Zonas de actividad institucional reciente",
  },
  "premium-discount": {
    label: "Premium / Discount",
    description: "Posición del precio respecto al rango",
  },
  killzone: {
    label: "Killzone",
    description: "Ventanas de tiempo de mayor edge estadístico",
  },
  special: {
    label: "Modelos / Especiales",
    description: "Patrones específicos de la metodología ICT",
  },
};

export const ICT_CATEGORY_ORDER: ICTCategory[] = [
  "liquidity",
  "manipulation",
  "structure",
  "imbalance",
  "orderblock",
  "premium-discount",
  "killzone",
  "special",
];

export const ICT_CONCEPTS: ICTConcept[] = [
  // === LIQUIDEZ ===
  { key: "PDH", label: "Previous Day High", category: "liquidity", iconType: "svg-component", description: "High del día anterior. Liquidez fuerte porque suele acumular stops de quienes vendieron en el rango del día previo." },
  { key: "PDL", label: "Previous Day Low", category: "liquidity", iconType: "svg-component", description: "Low del día anterior. Liquidez fuerte por stops de compradores del rango previo." },
  { key: "PWH", label: "Previous Week High", category: "liquidity", iconType: "svg-component", description: "High de la semana anterior. Liquidez muy fuerte, suele atraer movimientos importantes." },
  { key: "PWL", label: "Previous Week Low", category: "liquidity", iconType: "svg-component", description: "Low de la semana anterior. Liquidez muy fuerte, especialmente en lunes y martes." },
  { key: "LDN-H", label: "London Session High", category: "liquidity", iconType: "svg-component", description: "High de la sesión de Londres del día actual. Target frecuente de la sesión NY." },
  { key: "LDN-L", label: "London Session Low", category: "liquidity", iconType: "svg-component", description: "Low de la sesión de Londres del día actual. Target frecuente de la sesión NY." },
  { key: "NY-H", label: "NY Session High", category: "liquidity", iconType: "svg-component", description: "High de la sesión de Nueva York del día." },
  { key: "NY-L", label: "NY Session Low", category: "liquidity", iconType: "svg-component", description: "Low de la sesión de Nueva York del día." },
  { key: "ASIA-H", label: "Asian Session High", category: "liquidity", iconType: "svg-component", description: "High de la sesión asiática. Liquidez típicamente cazada en Londres." },
  { key: "ASIA-L", label: "Asian Session Low", category: "liquidity", iconType: "svg-component", description: "Low de la sesión asiática. Liquidez típicamente cazada en Londres." },
  { key: "EQH", label: "Equal Highs", category: "liquidity", iconType: "svg-component", description: "Dos o más highs al mismo nivel. Trampa de liquidez, alta probabilidad de barrido." },
  { key: "EQL", label: "Equal Lows", category: "liquidity", iconType: "svg-component", description: "Dos o más lows al mismo nivel. Trampa de liquidez, alta probabilidad de barrido." },

  // === MANIPULACIÓN ===
  { key: "SWEEP-H4", label: "Sweep H4", category: "manipulation", iconType: "svg-component", description: "Mecha de vela de 4 horas perfora liquidez y cierra del lado original. Sweep de alta calidad." },
  { key: "SWEEP-H1", label: "Sweep H1", category: "manipulation", iconType: "svg-component", description: "Mecha de vela de 1 hora perfora liquidez y cierra del lado original. Sweep estándar." },
  { key: "SWEEP-15M", label: "Sweep 15m", category: "manipulation", iconType: "svg-component", description: "Sweep en timeframe de 15 minutos. Confianza media." },
  { key: "SWEEP-5M", label: "Sweep 5m", category: "manipulation", iconType: "svg-component", description: "Sweep menor en 5 minutos. Solo para entradas de alta precisión." },
  { key: "STOP-RUN", label: "Stop Run", category: "manipulation", iconType: "svg-component", description: "Movimiento agresivo que caza stops antes de revertir bruscamente." },
  { key: "TURTLE-SOUP", label: "Turtle Soup", category: "manipulation", iconType: "svg-component", description: "Fakeout de breakout. Precio rompe un rango y vuelve adentro inmediatamente." },

  // === ESTRUCTURA ===
  { key: "CHoCH", label: "Change of Character", category: "structure", iconType: "svg-component", description: "Ruptura por cierre de vela contra la tendencia previa. Primera señal de reversión." },
  { key: "BOS", label: "Break of Structure", category: "structure", iconType: "svg-component", description: "Ruptura a favor de la tendencia. Confirma continuación del movimiento." },
  { key: "MSS", label: "Market Structure Shift", category: "structure", iconType: "svg-component", description: "Cambio de estructura confirmado, similar a CHoCH pero más amplio." },
  { key: "HH", label: "Higher High", category: "structure", iconType: "svg-component", description: "High más alto que el anterior. Estructura alcista." },
  { key: "HL", label: "Higher Low", category: "structure", iconType: "svg-component", description: "Low más alto que el anterior. Confirma tendencia alcista." },
  { key: "LH", label: "Lower High", category: "structure", iconType: "svg-component", description: "High más bajo que el anterior. Confirma tendencia bajista." },
  { key: "LL", label: "Lower Low", category: "structure", iconType: "svg-component", description: "Low más bajo que el anterior. Estructura bajista." },

  // === IMBALANCE ===
  { key: "FVG", label: "Fair Value Gap", category: "imbalance", iconType: "svg-component", description: "Desbalance entre tres velas donde la mecha de la vela 1 no se solapa con la de la vela 3." },
  { key: "IFVG", label: "Inverted FVG", category: "imbalance", iconType: "svg-component", description: "FVG previo invalidado por un cierre opuesto. Ahora actúa como soporte/resistencia inversa." },
  { key: "BPR", label: "Balanced Price Range", category: "imbalance", iconType: "svg-component", description: "Dos FVGs opuestos que se solapan. Zona de alta probabilidad de reacción." },
  { key: "VI", label: "Volume Imbalance", category: "imbalance", iconType: "svg-component", description: "Gap entre cierre de una vela y apertura de la siguiente, sin solapamiento de cuerpos." },
  { key: "OG", label: "Opening Gap", category: "imbalance", iconType: "svg-component", description: "Gap de apertura entre sesiones. Suele llenarse antes de continuar." },

  // === ORDER BLOCKS ===
  { key: "OB", label: "Order Block", category: "orderblock", iconType: "svg-component", description: "Última vela contraria antes de un movimiento institucional fuerte." },
  { key: "OB+", label: "Bullish Order Block", category: "orderblock", iconType: "svg-component", description: "Última vela bajista antes de una subida fuerte. Soporte institucional." },
  { key: "OB-", label: "Bearish Order Block", category: "orderblock", iconType: "svg-component", description: "Última vela alcista antes de una caída fuerte. Resistencia institucional." },
  { key: "BB", label: "Breaker Block", category: "orderblock", iconType: "svg-component", description: "Order block invalidado que ahora actúa de forma opuesta. Order block en quiebre." },
  { key: "MB", label: "Mitigation Block", category: "orderblock", iconType: "svg-component", description: "Zona donde el precio mitiga (toca) un order block previo no invalidado." },
  { key: "POI", label: "Point of Interest", category: "orderblock", iconType: "svg-component", description: "Zona genérica de interés institucional, agrupa varios conceptos relacionados." },

  // === PREMIUM / DISCOUNT ===
  { key: "PREMIUM", label: "Premium Zone", category: "premium-discount", iconType: "svg-component", description: "Precio en la mitad superior del rango. Zona ideal para buscar shorts." },
  { key: "DISCOUNT", label: "Discount Zone", category: "premium-discount", iconType: "svg-component", description: "Precio en la mitad inferior del rango. Zona ideal para buscar longs." },
  { key: "EQUILIBRIUM", label: "Equilibrium", category: "premium-discount", iconType: "svg-component", description: "Precio en el 50% del rango. Zona neutra, evitar entradas." },
  { key: "OTE", label: "Optimal Trade Entry", category: "premium-discount", iconType: "svg-component", description: "Entrada en el retroceso 62-79% Fibonacci. Zona óptima de bajo riesgo." },

  // === KILLZONES ===
  { key: "LDN-KZ", label: "London Killzone", category: "killzone", iconType: "svg-component", description: "Ventana 02:00-05:00 NY. Mayor edge estadístico de la sesión Londres." },
  { key: "NY-AM-KZ", label: "NY AM Killzone", category: "killzone", iconType: "svg-component", description: "Ventana 07:00-10:00 NY. La killzone dorada, mayor volumen y volatilidad." },
  { key: "NY-LUNCH", label: "NY Lunch", category: "killzone", iconType: "svg-component", description: "Ventana 11:00-12:30 NY. Zona de reversión de movimientos AM." },
  { key: "NY-PM-KZ", label: "NY PM Killzone", category: "killzone", iconType: "svg-component", description: "Ventana 13:30-16:00 NY. Última oportunidad antes del cierre." },
  { key: "ASIA-KZ", label: "Asia Killzone", category: "killzone", iconType: "svg-component", description: "Ventana 19:00-22:00 NY. Acumulación de rangos para Londres." },

  // === ESPECIALES ===
  { key: "SILVER-BULLET", label: "Silver Bullet", category: "special", iconType: "svg-component", description: "Setup ICT en ventana específica de 1 hora. Alta probabilidad cuando coincide con FVG." },
  { key: "JUDAS-SWING", label: "Judas Swing", category: "special", iconType: "svg-component", description: "Movimiento falso al inicio de sesión que caza stops antes del movimiento real." },
  { key: "POWER-OF-3", label: "Power of Three", category: "special", iconType: "svg-component", description: "Modelo de 3 fases: acumulación, manipulación, distribución." },
  { key: "AMD", label: "Accumulation-Manipulation-Distribution", category: "special", iconType: "svg-component", description: "Variante extendida del Power of 3 aplicada a sesiones completas." },
  { key: "HIGH-IMPACT", label: "High Impact News", category: "special", iconType: "svg-component", description: "Trade durante o cerca de noticia de alto impacto (NFP, FOMC, CPI). Alto riesgo." },
];

export function getConceptByKey(key: string): ICTConcept | undefined {
  return ICT_CONCEPTS.find((c) => c.key === key);
}

export function getConceptsByCategory(cat: ICTCategory): ICTConcept[] {
  return ICT_CONCEPTS.filter((c) => c.category === cat);
}

export const ICT_CONCEPT_KEYS: string[] = ICT_CONCEPTS.map((c) => c.key);
