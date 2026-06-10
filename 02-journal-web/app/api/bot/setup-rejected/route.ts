import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/telegram";
import { formatSetupRejectedHigh } from "@/lib/telegram-messages";
import { logBotRequest } from "@/lib/bot-telemetry";

export const dynamic = "force-dynamic";

// Bot POST endpoint: un setup CONFIRMED fue rechazado por Filters/Sizing/Execution
// (cap de riesgo, daily loss, spread alto, ATR muerto, kill switch, etc.).
// Side effects: solo crea BotEvent type=SETUP_REJECTED con metadata. No toca Trade.
export async function POST(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
    logBotRequest({ endpoint: "/api/bot/setup-rejected", authOk: false, result: "auth_failed" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const pair = String(body.pair ?? "").trim();
  const rejectionReason = String(body.rejectionReason ?? "").trim();

  if (!pair || !rejectionReason) {
    logBotRequest({
      endpoint: "/api/bot/setup-rejected",
      authOk: true,
      result: "validation_failed",
      payload: { pair },
    });
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

  // Modulo 14: Telegram solo si quality=HIGH (los MEDIUM/LOW serian spam).
  // after() difiere el fetch hasta despues de la respuesta sin descartarlo.
  if (body.qualityRating === "HIGH") {
    after(() =>
      sendTelegram(
        formatSetupRejectedHigh({
          pair,
          direction: body.direction,
          qualityRating: body.qualityRating,
          qualityScore:
            typeof body.qualityScore === "number"
              ? body.qualityScore
              : undefined,
          rejectionReason,
        }),
        { silent: true },
      ).catch((e) => console.error("[telegram] SETUP_REJECTED:", e)),
    );
  }

  logBotRequest({
    endpoint: "/api/bot/setup-rejected",
    authOk: true,
    result: "success",
    payload: { pair, direction: body.direction, qualityRating: body.qualityRating },
  });
  return NextResponse.json({ ok: true });
}
