import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TradeForm } from "@/components/TradeForm";
import type { TradeDTO } from "@/lib/trades";

type Params = { id: string };

export default async function EditTradePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;

  const trade = await prisma.trade.findFirst({
    where: { id, userId: session.user.id },
    include: { confluences: true },
  });
  if (!trade) notFound();

  const dto: TradeDTO = {
    id: trade.id,
    source: trade.source,
    pair: trade.pair,
    direction: trade.direction,
    qualityRating: trade.qualityRating,
    biasHTF: trade.biasHTF,
    killzone: trade.killzone,
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit1: trade.takeProfit1,
    takeProfit2: trade.takeProfit2,
    exitPrice: trade.exitPrice,
    positionSize: trade.positionSize,
    riskPercent: trade.riskPercent,
    riskUSD: trade.riskUSD,
    tp1Hit: trade.tp1Hit,
    tp2Hit: trade.tp2Hit,
    beHit: trade.beHit,
    rAchieved: trade.rAchieved,
    pnlUSD: trade.pnlUSD,
    entryTime: trade.entryTime.toISOString(),
    exitTime: trade.exitTime?.toISOString() ?? null,
    preTradeNotes: trade.preTradeNotes,
    postTradeNotes: trade.postTradeNotes,
    screenshotUrl: trade.screenshotUrl,
    confluences: trade.confluences.map((c) => c.conceptKey),
    createdAt: trade.createdAt.toISOString(),
  };

  return (
    <div className="max-w-3xl">
      <Link
        href={`/trades/${trade.id}`}
        className="inline-flex items-center gap-1 text-xs text-mute hover:text-cream uppercase mb-3"
        style={{ letterSpacing: "0.16em" }}
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Volver al trade
      </Link>
      <h1
        className="text-cream mb-6"
        style={{
          fontFamily: "var(--font-fraunces), serif",
          fontSize: "2rem",
          letterSpacing: "-0.01em",
        }}
      >
        Editar trade
      </h1>
      <TradeForm mode="edit" initial={dto} />
    </div>
  );
}
