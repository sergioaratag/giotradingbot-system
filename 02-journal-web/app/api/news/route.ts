import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, NewsImpact } from "@prisma/client";
import { isBlockingEvent, inBlockWindow } from "@/lib/news";

const IMPACTS: NewsImpact[] = ["HIGH", "MEDIUM", "LOW"];

function isImpact(s: string): s is NewsImpact {
  return (IMPACTS as readonly string[]).includes(s);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const currencyParam = searchParams.get("currency"); // CSV: USD,EUR
  const impactParam = searchParams.get("impact"); // CSV: HIGH,MEDIUM

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const defaultTo = new Date(defaultFrom);
  defaultTo.setUTCDate(defaultTo.getUTCDate() + 7);

  const from = fromStr ? new Date(fromStr) : defaultFrom;
  const to = toStr ? new Date(toStr) : defaultTo;

  const where: Prisma.NewsEventWhereInput = {
    scheduledAt: { gte: from, lte: to },
  };
  if (currencyParam) {
    const arr = currencyParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (arr.length) where.currency = { in: arr };
  }
  if (impactParam) {
    const arr = impactParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(isImpact);
    if (arr.length) where.impact = { in: arr };
  }

  const rows = await prisma.newsEvent.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
  });

  const events = rows.map((e) => ({
    id: e.id,
    title: e.title,
    country: e.country,
    currency: e.currency,
    impact: e.impact,
    scheduledAt: e.scheduledAt.toISOString(),
    actual: e.actual,
    forecast: e.forecast,
    previous: e.previous,
    isBlocked:
      isBlockingEvent(e.impact, e.currency) &&
      inBlockWindow(now, e.scheduledAt),
  }));

  return NextResponse.json({ events });
}
