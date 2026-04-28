import type { QualityRating } from "@prisma/client";

export function tradeCardClass(rating?: QualityRating | null): string {
  const base =
    "relative bg-coal border border-graphite rounded-md p-4 transition-colors";
  if (rating === "HIGH") {
    return `${base} border-rose`;
  }
  return base;
}

export function tradeCardCornerMark(rating?: QualityRating | null): boolean {
  return rating === "HIGH";
}
