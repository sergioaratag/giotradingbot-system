import type { NewsImpact } from "@prisma/client";

export type NewsEventDTO = {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: NewsImpact;
  scheduledAt: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  isBlocked: boolean;
};

// Bot block window (in minutes) before/after a HIGH-impact event in a major pair.
export const BLOCK_WINDOW_MIN = 30;
export const BLOCK_CURRENCIES = ["USD", "EUR", "GBP"] as const;

export function isBlockingEvent(
  impact: NewsImpact,
  currency: string,
): boolean {
  return (
    impact === "HIGH" &&
    (BLOCK_CURRENCIES as readonly string[]).includes(currency)
  );
}

export function inBlockWindow(
  now: Date,
  scheduledAt: Date,
  windowMin = BLOCK_WINDOW_MIN,
): boolean {
  const start = scheduledAt.getTime() - windowMin * 60_000;
  const end = scheduledAt.getTime() + windowMin * 60_000;
  return now.getTime() >= start && now.getTime() <= end;
}
