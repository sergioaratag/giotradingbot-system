import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAIRS = ["EURUSD", "GBPUSD"];
const TIMEFRAMES = ["M3", "M5", "M15", "H1", "H4"]; // Fix 2: sin M1

// Fase 6 — Velas para el chart custom (Lightweight Charts).
// time va en segundos Unix (UTC), ascendente. Requiere sesión.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pair = String(searchParams.get("pair") ?? "").toUpperCase();
  const timeframe = String(searchParams.get("timeframe") ?? "").toUpperCase();
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "200", 10) || 200, 1), 500);

  if (!PAIRS.includes(pair) || !TIMEFRAMES.includes(timeframe)) {
    return NextResponse.json({ error: "pair y timeframe válidos requeridos" }, { status: 400 });
  }

  const rows = await prisma.candle.findMany({
    where: { pair, timeframe },
    orderBy: { timestamp: "desc" },
    take: limit,
    select: { timestamp: true, open: true, high: true, low: true, close: true, volume: true },
  });

  // De más nuevo→más viejo a ascendente, con time en segundos Unix.
  const candles = rows
    .reverse()
    .map((c) => ({
      time: Math.floor(c.timestamp.getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

  return NextResponse.json({ pair, timeframe, candles });
}
