import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? 6 : day - 1; // Mon as start
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const now = new Date();

  // Fase 2.5: métricas sobre propios + del bot (isShared), EXCLUYENDO los
  // trades marcados excludeFromStats (evidencia que no sigue la estrategia).
  const trades = await prisma.trade.findMany({
    where: {
      excludeFromStats: false,
      OR: [{ userId }, { isShared: true }],
    },
    include: { confluences: true },
    orderBy: { entryTime: "desc" },
    take: 1000,
  });

  const closed = trades.filter((t) => t.exitTime != null);
  const closedToday = closed.filter((t) => t.exitTime! >= startOfDay(now));
  const closedWeek = closed.filter((t) => t.exitTime! >= startOfWeek(now));
  const closedMonth = closed.filter((t) => t.exitTime! >= startOfMonth(now));

  const tradesToday = trades.filter((t) => t.entryTime >= startOfDay(now));

  const sumPnL = (arr: typeof closed) =>
    arr.reduce((a, t) => a + (t.pnlUSD ?? 0), 0);

  const wins = closed.filter((t) => (t.rAchieved ?? 0) > 0);
  const losses = closed.filter((t) => (t.rAchieved ?? 0) < 0);
  const grossWin = wins.reduce((a, t) => a + (t.pnlUSD ?? 0), 0);
  const grossLoss = Math.abs(
    losses.reduce((a, t) => a + (t.pnlUSD ?? 0), 0),
  );

  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const avgR =
    closed.length > 0
      ? closed.reduce((a, t) => a + (t.rAchieved ?? 0), 0) / closed.length
      : 0;
  const expectancy = avgR;

  // Daily risk used today (sum of riskPercent of trades opened today)
  const dailyUsedPct = tradesToday.reduce(
    (a, t) => a + (t.riskPercent ?? 0),
    0,
  );

  // Win rate by quality
  const wrBy = (filterFn: (t: (typeof closed)[number]) => boolean) => {
    const subset = closed.filter(filterFn);
    if (subset.length === 0) return null;
    const w = subset.filter((t) => (t.rAchieved ?? 0) > 0).length;
    return { winRate: w / subset.length, count: subset.length };
  };

  const winRateByQuality = {
    HIGH: wrBy((t) => t.qualityRating === "HIGH"),
    MEDIUM: wrBy((t) => t.qualityRating === "MEDIUM"),
    LOW: wrBy((t) => t.qualityRating === "LOW"),
  };

  // Win rate by killzone
  const killzones = Array.from(
    new Set(closed.map((t) => t.killzone).filter(Boolean)),
  ) as string[];
  const winRateByKillzone: Record<string, { winRate: number; count: number }> =
    {};
  for (const kz of killzones) {
    const r = wrBy((t) => t.killzone === kz);
    if (r) winRateByKillzone[kz] = r;
  }

  // Win rate by concept (top 10 by count)
  const conceptStats: Record<string, { wins: number; total: number }> = {};
  for (const t of closed) {
    for (const c of t.confluences) {
      const k = c.conceptKey;
      if (!conceptStats[k]) conceptStats[k] = { wins: 0, total: 0 };
      conceptStats[k].total += 1;
      if ((t.rAchieved ?? 0) > 0) conceptStats[k].wins += 1;
    }
  }
  const winRateByConcept = Object.entries(conceptStats)
    .map(([k, v]) => ({
      conceptKey: k,
      winRate: v.total > 0 ? v.wins / v.total : 0,
      count: v.total,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Drawdown (sequential equity)
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  let currentDD = 0;
  const ordered = [...closed].sort(
    (a, b) => (a.exitTime!.getTime() - b.exitTime!.getTime()),
  );
  for (const t of ordered) {
    equity += t.pnlUSD ?? 0;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    currentDD = dd;
  }

  return NextResponse.json({
    totalTrades: trades.length,
    closedTrades: closed.length,
    winRate,
    profitFactor,
    avgR,
    expectancy,
    pnlToday: sumPnL(closedToday),
    pnlWeek: sumPnL(closedWeek),
    pnlMonth: sumPnL(closedMonth),
    tradesToday: tradesToday.length,
    tradesMonth: closedMonth.length,
    dailyUsedPct,
    drawdownCurrent: currentDD,
    drawdownMax: maxDD,
    winRateByQuality,
    winRateByKillzone,
    winRateByConcept,
  });
}
