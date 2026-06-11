import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logBotRequest } from "@/lib/bot-telemetry";

export const dynamic = "force-dynamic";

// Fase 5.1 — Estado vivo del bot por símbolo.
//   POST (bot, x-bot-api-key): upsert del estado de UN símbolo. Llamado cada
//     ~5s desde el EA. Fire-and-forget del lado del bot.
//   GET  (sesión): devuelve el estado de todos los símbolos para el panel live.

const SYMBOLS = ["EURUSD", "GBPUSD"];

function asArray(v: unknown): Prisma.InputJsonValue {
  return (Array.isArray(v) ? v : []) as Prisma.InputJsonValue;
}
function asStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function asNum(v: unknown): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
    logBotRequest({ endpoint: "/api/bot/state", authOk: false, result: "auth_failed" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  if (!SYMBOLS.includes(symbol)) {
    logBotRequest({
      endpoint: "/api/bot/state",
      authOk: true,
      result: "validation_failed",
      payload: { symbol },
    });
    return NextResponse.json(
      { error: `symbol debe ser uno de ${SYMBOLS.join(", ")}` },
      { status: 400 },
    );
  }

  const data = {
    biasH4: asStr(body.biasH4),
    biasD1: asStr(body.biasD1),
    killzone: asStr(body.killzone),
    currentBid: asNum(body.currentBid),
    currentAsk: asNum(body.currentAsk),
    fvgs: asArray(body.fvgs),
    sweeps: asArray(body.sweeps),
    markers: asArray(body.markers),
    chochState: asStr(body.chochState),
    currentAction: asStr(body.currentAction),
    reasoning: asStr(body.reasoning),
    nextStep: asStr(body.nextStep),
  };

  try {
    await prisma.botState.upsert({
      where: { symbol },
      create: { symbol, ...data },
      update: data,
    });
  } catch (error) {
    console.error("[POST /api/bot/state] Error:", error);
    logBotRequest({
      endpoint: "/api/bot/state",
      authOk: true,
      result: "db_error",
      payload: { symbol },
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  logBotRequest({
    endpoint: "/api/bot/state",
    authOk: true,
    result: "success",
    payload: { symbol, killzone: data.killzone, currentAction: data.currentAction },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const states = await prisma.botState.findMany({ orderBy: { symbol: "asc" } });
  return NextResponse.json({ states });
}
