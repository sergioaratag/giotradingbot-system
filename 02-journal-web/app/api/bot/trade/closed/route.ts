import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/telegram";
import { formatTradeClosed } from "@/lib/telegram-messages";

export const dynamic = "force-dynamic";

const BIG_LOSS_THRESHOLD_USD = 50;

const CLOSE_REASONS = [
  "SL_HIT",
  "CHOCH_CONTRARY",
  "NEWS_HIGH",
  "KILL_SWITCH",
  "FRIDAY_FORCE",
  "MANUAL",
] as const;
type CloseReason = (typeof CLOSE_REASONS)[number];

function isCloseReason(s: unknown): s is CloseReason {
  return typeof s === "string" && (CLOSE_REASONS as readonly string[]).includes(s);
}

// Bot POST endpoint: una posicion del bot dejo de existir.
// Body: { mt5Ticket, pair, closePrice, pnlUSD, rAchieved, closeReason, exitTime? }
// Side effects:
//   - update Trade row matched by mt5Ticket (exitPrice, exitTime, pnlUSD, rAchieved)
//   - create BotEvent (audit log)
export async function POST(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mt5Ticket = Number(body.mt5Ticket);
  const pair = String(body.pair ?? "").trim();
  const closePrice = Number(body.closePrice);
  const pnlUSD = Number(body.pnlUSD);
  const rAchieved = Number(body.rAchieved);
  const closeReason: CloseReason = isCloseReason(body.closeReason)
    ? body.closeReason
    : "SL_HIT";
  const exitTime = body.exitTime ? new Date(body.exitTime) : new Date();

  if (!Number.isFinite(mt5Ticket) || !pair || !Number.isFinite(closePrice)) {
    return NextResponse.json(
      { error: "mt5Ticket, pair, closePrice required" },
      { status: 400 },
    );
  }

  const trade = await prisma.trade.findUnique({ where: { mt5Ticket } });
  let updated = false;
  if (trade) {
    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        exitPrice: closePrice,
        exitTime,
        pnlUSD: Number.isFinite(pnlUSD) ? pnlUSD : null,
        rAchieved: Number.isFinite(rAchieved) ? rAchieved : null,
      },
    });
    updated = true;
  }

  await prisma.botEvent.create({
    data: {
      type: "TRADE_CLOSED",
      pair,
      message: `Closed @ ${closePrice} | PnL ${pnlUSD} USD | R=${rAchieved} | reason=${closeReason}`,
      metadata: {
        mt5Ticket,
        closePrice,
        pnlUSD,
        rAchieved,
        closeReason,
        tradeFound: updated,
      },
    },
  });

  // Modulo 14: notificacion Telegram. Sonido solo si perdida grande.
  const bigLoss =
    Number.isFinite(pnlUSD) && pnlUSD < -BIG_LOSS_THRESHOLD_USD;
  // after() difiere el fetch hasta despues de la respuesta sin descartarlo.
  after(() =>
    sendTelegram(
      formatTradeClosed({
        mt5Ticket,
        pair,
        closePrice,
        pnlUSD: Number.isFinite(pnlUSD) ? pnlUSD : 0,
        rAchieved: Number.isFinite(rAchieved) ? rAchieved : undefined,
        closeReason,
      }),
      { silent: !bigLoss },
    ).catch((e) => console.error("[telegram] TRADE_CLOSED:", e)),
  );

  return NextResponse.json({ ok: true, tradeUpdated: updated });
}
