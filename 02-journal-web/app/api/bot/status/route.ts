import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [rows, lastState] = await Promise.all([
    prisma.botConfig.findMany({ where: { key: { in: ["BotEnabled", "BotKillSwitch"] } } }),
    // Heartbeat: el BotState más reciente = última vez que el EA reportó.
    prisma.botState.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const map = new Map(rows.map((r) => [r.key, r.value === "true"]));
  return NextResponse.json({
    enabled: map.get("BotEnabled") ?? false,
    killSwitch: map.get("BotKillSwitch") ?? false,
    lastSeen: lastState?.updatedAt.toISOString() ?? null,
  });
}

export async function POST(req: Request) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled (boolean) requerido" },
      { status: 400 },
    );
  }
  await prisma.botConfig.upsert({
    where: { key: "BotEnabled" },
    create: {
      key: "BotEnabled",
      value: String(body.enabled),
      description: "Bot activo",
    },
    update: { value: String(body.enabled) },
  });
  await prisma.botEvent.create({
    data: {
      type: "BOT_TOGGLE",
      message: body.enabled ? "Enabled by user" : "Disabled by user",
      metadata: { userId: gate.userId },
    },
  });
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
