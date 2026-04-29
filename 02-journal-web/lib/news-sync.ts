import { prisma } from "@/lib/prisma";
import {
  fetchForexFactoryWeek,
  RELEVANT_CURRENCIES,
  type FFEvent,
  type FFImpact,
} from "@/lib/forexfactory";
import type { NewsImpact } from "@prisma/client";

export type SyncResult = {
  total: number;
  created: number;
  updated: number;
};

const IMPACT_MAP: Record<FFImpact, NewsImpact> = {
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
};

export async function syncForexFactory(): Promise<SyncResult> {
  const events = await fetchForexFactoryWeek();
  const relevant = events.filter((e) =>
    (RELEVANT_CURRENCIES as readonly string[]).includes(e.currency),
  );

  let created = 0;
  let updated = 0;

  for (const e of relevant) {
    const data = mapToDb(e);
    const existing = await prisma.newsEvent.findFirst({
      where: {
        title: data.title,
        scheduledAt: data.scheduledAt,
        currency: data.currency,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.newsEvent.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.newsEvent.create({ data });
      created++;
    }
  }

  return { total: relevant.length, created, updated };
}

function mapToDb(e: FFEvent) {
  return {
    title: e.title,
    country: e.country,
    currency: e.currency,
    impact: IMPACT_MAP[e.impact],
    scheduledAt: e.scheduledAt,
    actual: e.actual ?? null,
    forecast: e.forecast ?? null,
    previous: e.previous ?? null,
    source: "ForexFactory",
  };
}
