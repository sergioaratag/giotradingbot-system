import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth-helpers";
import { sendTelegram } from "@/lib/telegram";
import {
  formatKillSwitchActivated,
  formatKillSwitchDeactivated,
} from "@/lib/telegram-messages";

export const dynamic = "force-dynamic";

const KILL = "BotKillSwitch";
const ENABLED = "BotEnabled";

async function readFlag(key: string): Promise<boolean> {
  const row = await prisma.botConfig.findUnique({ where: { key } });
  return row?.value === "true";
}

// Bot polling endpoint — auth via X-Bot-Api-Key.
// Returns the killSwitch + enabled flags only.
export async function GET(req: Request) {
  const apiKey = req.headers.get("x-bot-api-key");
  const expected = process.env.BOT_API_KEY;
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [killSwitch, botEnabled] = await Promise.all([
    readFlag(KILL),
    readFlag(ENABLED),
  ]);
  return NextResponse.json({ killSwitch, botEnabled });
}

// User session endpoint — toggles the kill switch.
export async function POST(req: Request) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const activated = Boolean(body.activated);

  await prisma.botConfig.upsert({
    where: { key: KILL },
    create: {
      key: KILL,
      value: String(activated),
      description: "Kill switch activado (override)",
    },
    update: { value: String(activated) },
  });

  if (activated) {
    await prisma.botEvent.create({
      data: {
        type: "KILL_SWITCH",
        message: "Activated by user",
        metadata: { userId: gate.userId, userEmail: gate.email },
      },
    });
  } else {
    await prisma.botEvent.create({
      data: {
        type: "KILL_SWITCH",
        message: "Deactivated by user",
        metadata: { userId: gate.userId, userEmail: gate.email },
      },
    });
  }

  // Modulo 14: Telegram con sonido cuando el user activa/desactiva manualmente.
  sendTelegram(
    activated ? formatKillSwitchActivated() : formatKillSwitchDeactivated(),
    { silent: !activated },
  ).catch((e) => console.error("[telegram] KILL_SWITCH:", e));

  return NextResponse.json({ ok: true, killSwitch: activated });
}
