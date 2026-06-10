import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBotRequest } from "@/lib/bot-telemetry";

export const dynamic = "force-dynamic";

// Fase 6 — Recibe velas OHLC del bot (MT5) y las persiste para el chart custom.
//   POST (bot, x-bot-api-key). Upsert idempotente por (pair, timeframe, timestamp).
//   Retención: máximo 500 velas por (pair, timeframe).

const PAIRS = ["EURUSD", "GBPUSD"];
const TIMEFRAMES = ["M1", "M3", "M5", "M15", "H1", "H4"];
const MAX_PER_COMBO = 500;

type IncomingCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function validCandle(c: unknown): c is IncomingCandle {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.timestamp === "string" &&
    Number.isFinite(Number(o.open)) &&
    Number.isFinite(Number(o.high)) &&
    Number.isFinite(Number(o.low)) &&
    Number.isFinite(Number(o.close)) &&
    !Number.isNaN(Date.parse(o.timestamp))
  );
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
    logBotRequest({ endpoint: "/api/bot/candles", authOk: false, result: "auth_failed" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const pair = String(body.pair ?? "").trim().toUpperCase();
  const timeframe = String(body.timeframe ?? "").trim().toUpperCase();
  const incoming: unknown[] = Array.isArray(body.candles) ? body.candles : [];

  if (!PAIRS.includes(pair) || !TIMEFRAMES.includes(timeframe) || incoming.length === 0) {
    logBotRequest({
      endpoint: "/api/bot/candles",
      authOk: true,
      result: "validation_failed",
      payload: { pair, timeframe, count: incoming.length },
    });
    return NextResponse.json(
      { error: "pair, timeframe válidos y candles[] no vacío requeridos" },
      { status: 400 },
    );
  }

  const candles = incoming.filter(validCandle).slice(0, 600);

  try {
    // Upsert idempotente: la vela en formación cambia OHLC con el mismo timestamp.
    await prisma.$transaction(
      candles.map((c) => {
        const ts = new Date(c.timestamp);
        const data = {
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number.isFinite(Number(c.volume)) ? Math.trunc(Number(c.volume)) : 0,
        };
        return prisma.candle.upsert({
          where: { pair_timeframe_timestamp: { pair, timeframe, timestamp: ts } },
          create: { pair, timeframe, timestamp: ts, ...data },
          update: data,
        });
      }),
    );

    // Retención: borrar lo que exceda las MAX_PER_COMBO más recientes.
    const cutoff = await prisma.candle.findMany({
      where: { pair, timeframe },
      orderBy: { timestamp: "desc" },
      skip: MAX_PER_COMBO,
      take: 1,
      select: { timestamp: true },
    });
    if (cutoff.length > 0) {
      await prisma.candle.deleteMany({
        where: { pair, timeframe, timestamp: { lt: cutoff[0].timestamp } },
      });
    }
  } catch (error) {
    console.error("[POST /api/bot/candles] Error:", error);
    logBotRequest({
      endpoint: "/api/bot/candles",
      authOk: true,
      result: "db_error",
      payload: { pair, timeframe, count: candles.length },
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  logBotRequest({
    endpoint: "/api/bot/candles",
    authOk: true,
    result: "success",
    payload: { pair, timeframe, upserted: candles.length },
  });
  return NextResponse.json({ ok: true, upserted: candles.length });
}
