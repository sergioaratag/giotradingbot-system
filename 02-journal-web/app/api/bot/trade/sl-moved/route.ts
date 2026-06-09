import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/telegram";
import { formatSLMoved } from "@/lib/telegram-messages";
import { logBotRequest } from "@/lib/bot-telemetry";
import { parseMt5Ticket } from "@/lib/mt5-ticket";

export const dynamic = "force-dynamic";

// Bot POST endpoint: trailing escalonado movio el SL.
// Body: { mt5Ticket, pair, newSL, rLevelReached }
// Side effects:
//   - update Trade row matched by mt5Ticket (stopLoss = newSL; beHit = true si R>=1)
//   - create BotEvent (audit log) con metadata completa
export async function POST(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
    logBotRequest({ endpoint: "/api/bot/trade/sl-moved", authOk: false, result: "auth_failed" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mt5Ticket = parseMt5Ticket(body.mt5Ticket);
  const pair = String(body.pair ?? "").trim();
  const newSL = Number(body.newSL);
  const rLevelReached = Number(body.rLevelReached);

  if (
    mt5Ticket == null ||
    !pair ||
    !Number.isFinite(newSL) ||
    !Number.isFinite(rLevelReached)
  ) {
    logBotRequest({
      endpoint: "/api/bot/trade/sl-moved",
      authOk: true,
      result: "validation_failed",
      payload: { pair, mt5Ticket: mt5Ticket?.toString() ?? null },
    });
    return NextResponse.json(
      { error: "mt5Ticket, pair, newSL, rLevelReached required" },
      { status: 400 },
    );
  }

  const trade = await prisma.trade.findUnique({ where: { mt5Ticket } });
  let updated = false;
  if (trade) {
    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        stopLoss: newSL,
        beHit: trade.beHit || rLevelReached >= 1,
      },
    });
    updated = true;
  }

  await prisma.botEvent.create({
    data: {
      type: "SL_MOVED",
      pair,
      message: `SL trailed to R=${rLevelReached} @ ${newSL}`,
      metadata: { mt5Ticket: mt5Ticket.toString(), newSL, rLevelReached, tradeFound: updated },
    },
  });

  // Modulo 14: notificacion Telegram (silenciosa, sin sonido).
  // after() difiere el fetch hasta despues de la respuesta sin descartarlo.
  after(() =>
    sendTelegram(formatSLMoved({ mt5Ticket: mt5Ticket.toString(), pair, newSL, rLevelReached }), {
      silent: true,
    }).catch((e) => console.error("[telegram] SL_MOVED:", e)),
  );

  logBotRequest({
    endpoint: "/api/bot/trade/sl-moved",
    authOk: true,
    result: "success",
    payload: { pair, mt5Ticket: mt5Ticket.toString(), tradeUpdated: updated },
  });
  return NextResponse.json({ ok: true, tradeUpdated: updated });
}
