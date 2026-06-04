import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TradeDirection, QualityRating } from "@prisma/client";
import { sendTelegram } from "@/lib/telegram";
import { formatTradeOpened } from "@/lib/telegram-messages";

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

  const mt5Ticket =
    body.mt5Ticket != null && Number.isFinite(Number(body.mt5Ticket))
      ? Number(body.mt5Ticket)
      : null;

  try {
    const trade = await prisma.trade.create({
      data: {
        userId: user.id,
        mt5Ticket,
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

    // Modulo 14: notificacion Telegram fire-and-forget (con sonido).
    // Se difiere con after() para que el fetch a Telegram complete DESPUES de
    // enviar el 201 sin bloquear al bot. En serverless un promise sin await ni
    // after() se descarta al congelarse la instancia (= "No outgoing requests").
    after(() =>
      sendTelegram(
        formatTradeOpened({
          mt5Ticket: trade.mt5Ticket ?? "?",
          pair,
          direction,
          qualityRating: trade.qualityRating ?? null,
          qualityScore:
            typeof body.qualityScore === "number"
              ? body.qualityScore
              : undefined,
          biasHTF: trade.biasHTF ?? null,
          killzone: trade.killzone ?? null,
          entryPrice,
          stopLoss,
          positionSize: trade.positionSize,
          riskPercent: trade.riskPercent,
          riskUSD: trade.riskUSD,
          confluences,
        }),
        { silent: false },
      ).catch((e) => console.error("[telegram] TRADE_OPENED:", e)),
    );

    return NextResponse.json(
      { ok: true, tradeId: trade.id, mt5Ticket: trade.mt5Ticket },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/bot/trade] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack:
          process.env.NODE_ENV !== "production" && error instanceof Error
            ? error.stack
            : undefined,
      },
      { status: 500 },
    );
  }
}
