import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Date",
  "Pair",
  "Direction",
  "Quality",
  "Bias",
  "Killzone",
  "Confluences",
  "Entry",
  "SL",
  "TP1",
  "TP2",
  "Exit",
  "RiskUSD",
  "R",
  "PnL",
  "Result",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s === "") return "";
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function tradeResult(t: {
  tp2Hit: boolean;
  tp1Hit: boolean;
  beHit: boolean;
  pnlUSD: number | null;
}): string {
  if (t.tp2Hit) return "TP2";
  if (t.tp1Hit) return "TP1";
  if (t.beHit) return "BE";
  if (t.pnlUSD !== null && t.pnlUSD < 0) return "SL";
  return "OPEN";
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  // Fase 2.5: exportar propios + del bot (isShared).
  const where: Prisma.TradeWhereInput = {
    OR: [{ userId: session.user.id }, { isShared: true }],
  };
  if (fromStr || toStr) {
    where.entryTime = {};
    if (fromStr) where.entryTime.gte = new Date(fromStr);
    if (toStr) where.entryTime.lte = new Date(toStr);
  }

  const trades = await prisma.trade.findMany({
    where,
    orderBy: { entryTime: "asc" },
    include: { confluences: true },
  });

  const lines: string[] = [HEADERS.join(",")];
  for (const t of trades) {
    const confluences = t.confluences.map((c) => c.conceptKey).join("|");
    const row = [
      t.entryTime.toISOString(),
      t.pair,
      t.direction,
      t.qualityRating ?? "",
      t.biasHTF ?? "",
      t.killzone ?? "",
      confluences,
      t.entryPrice,
      t.stopLoss,
      t.takeProfit1 ?? "",
      t.takeProfit2 ?? "",
      t.exitPrice ?? "",
      t.riskUSD,
      t.rAchieved ?? "",
      t.pnlUSD ?? "",
      tradeResult({
        tp2Hit: t.tp2Hit,
        tp1Hit: t.tp1Hit,
        beHit: t.beHit,
        pnlUSD: t.pnlUSD,
      }),
    ].map(csvEscape);
    lines.push(row.join(","));
  }

  const csv = lines.join("\n") + "\n";
  const today = new Date().toISOString().slice(0, 10);
  const filename = `gio-trades-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
