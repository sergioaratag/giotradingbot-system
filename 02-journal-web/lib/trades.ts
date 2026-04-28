import type {
  BiasHTF,
  QualityRating,
  TradeDirection,
  TradeSource,
} from "@prisma/client";

export type TradeDTO = {
  id: string;
  source: TradeSource;
  pair: string;
  direction: TradeDirection;
  qualityRating: QualityRating | null;
  biasHTF: BiasHTF | null;
  killzone: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number | null;
  takeProfit2: number | null;
  exitPrice: number | null;
  positionSize: number;
  riskPercent: number;
  riskUSD: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  beHit: boolean;
  rAchieved: number | null;
  pnlUSD: number | null;
  entryTime: string;
  exitTime: string | null;
  preTradeNotes: string | null;
  postTradeNotes: string | null;
  screenshotUrl: string | null;
  confluences: string[]; // conceptKeys
  createdAt: string;
};

export const PAIRS = ["EUR-USD", "GBP-USD", "USD-JPY", "XAU-USD"] as const;

export const QUALITIES: QualityRating[] = ["HIGH", "MEDIUM", "LOW"];
export const QUALITY_RISK: Record<QualityRating, number> = {
  HIGH: 1.5,
  MEDIUM: 1.0,
  LOW: 0.5,
};

export const BIASES: BiasHTF[] = ["BULLISH", "BEARISH", "NEUTRAL"];
export const DIRECTIONS: TradeDirection[] = ["LONG", "SHORT"];
export const SOURCES: TradeSource[] = ["BOT", "MANUAL"];

export const KILLZONES = [
  "LDN-KZ",
  "NY-AM-KZ",
  "NY-LUNCH",
  "NY-PM-KZ",
  "ASIA-KZ",
  "OUTSIDE",
] as const;

export function pipsBetween(pair: string, a: number, b: number): number {
  const decimals = pair.toLowerCase().includes("jpy") ? 2 : 4;
  const factor = Math.pow(10, decimals);
  return Math.abs(a - b) * factor;
}

export function calcRR(
  direction: TradeDirection,
  entry: number,
  sl: number,
  tp: number | null,
): number | null {
  if (!tp || sl === entry) return null;
  const risk = Math.abs(entry - sl);
  const reward =
    direction === "LONG" ? tp - entry : entry - tp;
  if (risk === 0) return null;
  return reward / risk;
}
