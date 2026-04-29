import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const [trades, notes, tasks, vault] = await Promise.all([
    prisma.trade.count({ where: { userId } }),
    prisma.note.count({ where: { userId } }),
    prisma.task.count({ where: { userId } }),
    prisma.vaultEntry.count({ where: { userId } }),
  ]);
  return NextResponse.json({
    counts: { trades, notes, tasks, vault },
    botApiKey: maskKey(process.env.BOT_API_KEY ?? ""),
    version: "GioTradingBot - ICT v1.0",
    dbRegion: process.env.DB_REGION ?? "AWS São Paulo (sa-east-1)",
  });
}

function maskKey(key: string) {
  if (!key) return { last4: "", present: false };
  return { last4: key.slice(-4), present: true };
}
