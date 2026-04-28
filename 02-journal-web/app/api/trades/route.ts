import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type {
  Prisma,
  QualityRating,
  TradeDirection,
  TradeSource,
} from "@prisma/client";

const QUALITIES = ["HIGH", "MEDIUM", "LOW"] as const;
const SOURCES = ["BOT", "MANUAL"] as const;
const DIRECTIONS = ["LONG", "SHORT"] as const;

function isQuality(s: unknown): s is QualityRating {
  return typeof s === "string" && (QUALITIES as readonly string[]).includes(s);
}
function isSource(s: unknown): s is TradeSource {
  return typeof s === "string" && (SOURCES as readonly string[]).includes(s);
}
function isDirection(s: unknown): s is TradeDirection {
  return typeof s === "string" && (DIRECTIONS as readonly string[]).includes(s);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pair = searchParams.get("pair");
  const source = searchParams.get("source");
  const quality = searchParams.get("quality");
  const killzone = searchParams.get("killzone");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const concepts = searchParams.getAll("concept"); // multiple
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const where: Prisma.TradeWhereInput = { userId: session.user.id };
  if (pair) where.pair = pair;
  if (source && isSource(source)) where.source = source;
  if (quality && isQuality(quality)) where.qualityRating = quality;
  if (killzone) where.killzone = killzone;
  if (dateFrom || dateTo) {
    where.entryTime = {};
    if (dateFrom) where.entryTime.gte = new Date(dateFrom);
    if (dateTo) where.entryTime.lte = new Date(dateTo);
  }
  if (concepts.length > 0) {
    where.AND = concepts.map((k) => ({
      confluences: { some: { conceptKey: k } },
    }));
  }

  const trades = await prisma.trade.findMany({
    where,
    orderBy: { entryTime: "desc" },
    take: limit,
    include: { confluences: true },
  });

  return NextResponse.json({
    trades: trades.map((t) => ({
      ...t,
      entryTime: t.entryTime.toISOString(),
      exitTime: t.exitTime?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      confluences: t.confluences.map((c) => c.conceptKey),
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const pair = String(body.pair ?? "").trim();
  const direction = isDirection(body.direction) ? body.direction : null;
  const entryPrice = Number(body.entryPrice);
  const stopLoss = Number(body.stopLoss);

  if (!pair || !direction || !Number.isFinite(entryPrice) || !Number.isFinite(stopLoss)) {
    return NextResponse.json(
      { error: "pair, direction, entryPrice, stopLoss required" },
      { status: 400 },
    );
  }

  const confluences: string[] = Array.isArray(body.confluences)
    ? body.confluences.map(String).filter(Boolean)
    : [];

  if (confluences.length === 0) {
    return NextResponse.json(
      { error: "at least 1 confluence required" },
      { status: 400 },
    );
  }

  const source: TradeSource = isSource(body.source) ? body.source : "MANUAL";
  const qualityRating = isQuality(body.qualityRating) ? body.qualityRating : null;
  const biasHTF = body.biasHTF && ["BULLISH", "BEARISH", "NEUTRAL"].includes(body.biasHTF)
    ? body.biasHTF
    : null;

  const trade = await prisma.trade.create({
    data: {
      userId: session.user.id,
      source,
      pair,
      direction,
      qualityRating,
      biasHTF,
      killzone: body.killzone ? String(body.killzone) : null,
      entryPrice,
      stopLoss,
      takeProfit1: body.takeProfit1 != null ? Number(body.takeProfit1) : null,
      takeProfit2: body.takeProfit2 != null ? Number(body.takeProfit2) : null,
      exitPrice: body.exitPrice != null ? Number(body.exitPrice) : null,
      positionSize: Number(body.positionSize ?? 0),
      riskPercent: Number(body.riskPercent ?? 0),
      riskUSD: Number(body.riskUSD ?? 0),
      tp1Hit: Boolean(body.tp1Hit),
      tp2Hit: Boolean(body.tp2Hit),
      beHit: Boolean(body.beHit),
      rAchieved: body.rAchieved != null ? Number(body.rAchieved) : null,
      pnlUSD: body.pnlUSD != null ? Number(body.pnlUSD) : null,
      entryTime: body.entryTime ? new Date(body.entryTime) : new Date(),
      exitTime: body.exitTime ? new Date(body.exitTime) : null,
      preTradeNotes: body.preTradeNotes ? String(body.preTradeNotes) : null,
      postTradeNotes: body.postTradeNotes ? String(body.postTradeNotes) : null,
      screenshotUrl: body.screenshotUrl ? String(body.screenshotUrl) : null,
      confluences: {
        create: confluences.map((conceptKey) => ({ conceptKey })),
      },
    },
    include: { confluences: true },
  });

  return NextResponse.json({ trade }, { status: 201 });
}
