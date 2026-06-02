import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Bot POST endpoint: un setup CONFIRMED fue rechazado por Filters/Sizing/Execution
// (cap de riesgo, daily loss, spread alto, ATR muerto, kill switch, etc.).
// Side effects: solo crea BotEvent type=SETUP_REJECTED con metadata. No toca Trade.
export async function POST(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const pair = String(body.pair ?? "").trim();
  const rejectionReason = String(body.rejectionReason ?? "").trim();

  if (!pair || !rejectionReason) {
    return NextResponse.json(
      { error: "pair and rejectionReason required" },
      { status: 400 },
    );
  }

  await prisma.botEvent.create({
    data: {
      type: "SETUP_REJECTED",
      pair,
      message: `${body.direction ?? "?"} ${body.qualityRating ?? "?"} rejected: ${rejectionReason}`,
      // Toda la confluencia para analisis posterior.
      metadata: body,
    },
  });

  return NextResponse.json({ ok: true });
}
