import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CONFIRM_TEXT = "RESET ALL MY DATA";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const confirmText = String(body.confirmText ?? "");
  if (confirmText !== CONFIRM_TEXT) {
    return NextResponse.json(
      { error: `Confirmación inválida. Escribe exactamente: ${CONFIRM_TEXT}` },
      { status: 400 },
    );
  }

  const userId = session.user.id;

  const trades = await prisma.trade.findMany({
    where: { userId },
    select: { id: true },
  });
  const tradeIds = trades.map((t) => t.id);

  const [confluences, tradesDel, notes, tasks, vault] = await prisma.$transaction([
    prisma.tradeConfluence.deleteMany({
      where: tradeIds.length ? { tradeId: { in: tradeIds } } : { id: "_none_" },
    }),
    prisma.trade.deleteMany({ where: { userId } }),
    prisma.note.deleteMany({ where: { userId } }),
    prisma.task.deleteMany({ where: { userId } }),
    prisma.vaultEntry.deleteMany({ where: { userId } }),
  ]);

  return NextResponse.json({
    ok: true,
    deletedCounts: {
      tradeConfluences: confluences.count,
      trades: tradesDel.count,
      notes: notes.count,
      tasks: tasks.count,
      vaultEntries: vault.count,
    },
  });
}
