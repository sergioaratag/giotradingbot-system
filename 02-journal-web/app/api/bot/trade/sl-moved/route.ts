import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mt5Ticket = Number(body.mt5Ticket);
  const pair = String(body.pair ?? "").trim();
  const newSL = Number(body.newSL);
  const rLevelReached = Number(body.rLevelReached);

  if (
    !Number.isFinite(mt5Ticket) ||
    !pair ||
    !Number.isFinite(newSL) ||
    !Number.isFinite(rLevelReached)
  ) {
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
      metadata: { mt5Ticket, newSL, rLevelReached, tradeFound: updated },
    },
  });

  return NextResponse.json({ ok: true, tradeUpdated: updated });
}
