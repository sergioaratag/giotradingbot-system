import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, QualityRating, TradeDirection } from "@prisma/client";

const QUALITIES = ["HIGH", "MEDIUM", "LOW"] as const;
const DIRECTIONS = ["LONG", "SHORT"] as const;

function isQuality(s: unknown): s is QualityRating {
  return typeof s === "string" && (QUALITIES as readonly string[]).includes(s);
}
function isDirection(s: unknown): s is TradeDirection {
  return typeof s === "string" && (DIRECTIONS as readonly string[]).includes(s);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const trade = await prisma.trade.findFirst({
    where: { id, userId: session.user.id },
    include: { confluences: true },
  });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    trade: {
      ...trade,
      entryTime: trade.entryTime.toISOString(),
      exitTime: trade.exitTime?.toISOString() ?? null,
      createdAt: trade.createdAt.toISOString(),
      confluences: trade.confluences.map((c) => c.conceptKey),
    },
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const owned = await prisma.trade.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Prisma.TradeUpdateInput = {};

  if (typeof body.pair === "string") data.pair = body.pair;
  if (isDirection(body.direction)) data.direction = body.direction;
  if (isQuality(body.qualityRating)) data.qualityRating = body.qualityRating;
  if (body.biasHTF && ["BULLISH", "BEARISH", "NEUTRAL"].includes(body.biasHTF))
    data.biasHTF = body.biasHTF;
  if (body.killzone !== undefined)
    data.killzone = body.killzone ? String(body.killzone) : null;

  const numFields: (keyof Prisma.TradeUpdateInput)[] = [
    "entryPrice",
    "stopLoss",
    "takeProfit1",
    "takeProfit2",
    "exitPrice",
    "positionSize",
    "riskPercent",
    "riskUSD",
    "rAchieved",
    "pnlUSD",
  ];
  for (const f of numFields) {
    const v = (body as Record<string, unknown>)[f as string];
    if (v !== undefined) {
      (data as Record<string, unknown>)[f as string] =
        v === null ? null : Number(v);
    }
  }

  if (typeof body.tp1Hit === "boolean") data.tp1Hit = body.tp1Hit;
  if (typeof body.tp2Hit === "boolean") data.tp2Hit = body.tp2Hit;
  if (typeof body.beHit === "boolean") data.beHit = body.beHit;

  if (body.entryTime) data.entryTime = new Date(body.entryTime);
  if (body.exitTime !== undefined)
    data.exitTime = body.exitTime ? new Date(body.exitTime) : null;

  if (body.preTradeNotes !== undefined)
    data.preTradeNotes = body.preTradeNotes
      ? String(body.preTradeNotes)
      : null;
  if (body.postTradeNotes !== undefined)
    data.postTradeNotes = body.postTradeNotes
      ? String(body.postTradeNotes)
      : null;
  if (body.screenshotUrl !== undefined)
    data.screenshotUrl = body.screenshotUrl ? String(body.screenshotUrl) : null;

  const confluences: string[] | null = Array.isArray(body.confluences)
    ? body.confluences.map(String).filter(Boolean)
    : null;

  const trade = await prisma.$transaction(async (tx) => {
    const updated = await tx.trade.update({ where: { id }, data });
    if (confluences) {
      await tx.tradeConfluence.deleteMany({ where: { tradeId: id } });
      if (confluences.length > 0) {
        await tx.tradeConfluence.createMany({
          data: confluences.map((conceptKey) => ({ tradeId: id, conceptKey })),
        });
      }
    }
    return updated;
  });

  return NextResponse.json({ trade });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await prisma.trade.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.trade.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
