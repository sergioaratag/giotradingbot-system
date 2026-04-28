import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TradeDirection, QualityRating } from "@prisma/client";

const DIRECTIONS = ["LONG", "SHORT"] as const;
const QUALITIES = ["HIGH", "MEDIUM", "LOW"] as const;

function isDirection(s: unknown): s is TradeDirection {
  return typeof s === "string" && (DIRECTIONS as readonly string[]).includes(s);
}
function isQuality(s: unknown): s is QualityRating {
  return typeof s === "string" && (QUALITIES as readonly string[]).includes(s);
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
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

  // Single-user system — pick first user, optionally override via header
  const explicitUserId = req.headers.get("x-user-id");
  const user = explicitUserId
    ? await prisma.user.findUnique({ where: { id: explicitUserId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return NextResponse.json({ error: "No user" }, { status: 500 });
  }

  const confluences: string[] = Array.isArray(body.confluences)
    ? body.confluences.map(String).filter(Boolean)
    : [];

  const trade = await prisma.trade.create({
    data: {
      userId: user.id,
      source: "BOT",
      pair,
      direction,
      qualityRating: isQuality(body.qualityRating) ? body.qualityRating : null,
      biasHTF:
        body.biasHTF && ["BULLISH", "BEARISH", "NEUTRAL"].includes(body.biasHTF)
          ? body.biasHTF
          : null,
      killzone: body.killzone ? String(body.killzone) : null,
      entryPrice,
      stopLoss,
      takeProfit1: body.takeProfit1 != null ? Number(body.takeProfit1) : null,
      takeProfit2: body.takeProfit2 != null ? Number(body.takeProfit2) : null,
      positionSize: Number(body.positionSize ?? 0),
      riskPercent: Number(body.riskPercent ?? 0),
      riskUSD: Number(body.riskUSD ?? 0),
      entryTime: body.entryTime ? new Date(body.entryTime) : new Date(),
      preTradeNotes: body.preTradeNotes ? String(body.preTradeNotes) : null,
      confluences:
        confluences.length > 0
          ? { create: confluences.map((conceptKey) => ({ conceptKey })) }
          : undefined,
    },
  });

  return NextResponse.json({ ok: true, tradeId: trade.id }, { status: 201 });
}
