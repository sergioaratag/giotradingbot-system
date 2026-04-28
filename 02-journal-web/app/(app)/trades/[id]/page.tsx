import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConfluencePill } from "@/components/ConfluencePill";
import { TradeDeleteButton } from "@/components/TradeDeleteButton";
import { tradeCardClass } from "@/lib/style-helpers";
import { pipsBetween, calcRR } from "@/lib/trades";
import { getConceptByKey } from "@/lib/ict-concepts";

type Params = { id: string };

export default async function TradeDetailPage({
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

  const r = trade.rAchieved ?? 0;
  const pnl = trade.pnlUSD ?? 0;
  const slPips = pipsBetween(trade.pair, trade.entryPrice, trade.stopLoss);
  const rrTp1 = calcRR(trade.direction, trade.entryPrice, trade.stopLoss, trade.takeProfit1);
  const rrTp2 = calcRR(trade.direction, trade.entryPrice, trade.stopLoss, trade.takeProfit2);

  const duration =
    trade.exitTime
      ? Math.round((trade.exitTime.getTime() - trade.entryTime.getTime()) / 60000)
      : null;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-3">
        <Link
          href="/trades"
          className="inline-flex items-center gap-1 text-xs text-mute hover:text-cream uppercase"
          style={{ letterSpacing: "0.16em" }}
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          Trades
        </Link>
        <span className="font-mono text-xs text-mute">
          {format(trade.entryTime, "dd MMM yyyy · HH:mm")}
        </span>
      </div>

      {/* HERO */}
      <div className={`mb-8 ${tradeCardClass(trade.qualityRating)}`}>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-cream"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontSize: "2rem",
                letterSpacing: "-0.01em",
              }}
            >
              {trade.pair} · {trade.direction}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {trade.qualityRating && (
                <span
                  className="rounded-sm px-2 py-0.5 uppercase"
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.14em",
                    background: "var(--color-graphite)",
                    color:
                      trade.qualityRating === "HIGH"
                        ? "var(--color-rose)"
                        : trade.qualityRating === "MEDIUM"
                        ? "var(--color-violet)"
                        : "var(--color-mute)",
                  }}
                >
                  {trade.qualityRating}
                </span>
              )}
              <span
                className="rounded-sm px-2 py-0.5 uppercase font-mono text-mute"
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.14em",
                  background: "var(--color-graphite)",
                }}
              >
                {trade.source}
              </span>
            </div>
          </div>
          <div
            className="text-right font-mono tabular-nums"
            style={{
              color:
                pnl > 0
                  ? "var(--color-rose)"
                  : pnl < 0
                  ? "var(--color-mute)"
                  : "var(--color-cream)",
            }}
          >
            <div className="text-3xl">
              {trade.rAchieved != null
                ? `${r > 0 ? "+" : ""}${r.toFixed(2)}R`
                : "—"}
            </div>
            <div className="text-sm text-dust">
              {trade.pnlUSD != null
                ? `${pnl > 0 ? "+" : ""}$${pnl.toFixed(2)}`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* SETUP */}
          <Card title="Setup">
            <Row label="Killzone" value={trade.killzone ?? "—"} mono />
            <Row label="Bias HTF" value={trade.biasHTF ?? "—"} />
            <div className="mt-3">
              <div
                className="text-mute uppercase mb-2"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                Confluencias ({trade.confluences.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trade.confluences.map((c) => {
                  const concept = getConceptByKey(c.conceptKey);
                  return (
                    <ConfluencePill
                      key={c.id}
                      conceptKey={c.conceptKey}
                      title={
                        concept
                          ? `${concept.label} — ${concept.description}`
                          : c.conceptKey
                      }
                    />
                  );
                })}
              </div>
            </div>
          </Card>

          {/* NIVELES */}
          <Card title="Niveles">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <Row label="Entrada" value={trade.entryPrice.toString()} mono />
              <Row label="Stop Loss" value={trade.stopLoss.toString()} mono />
              <Row
                label="Take Profit 1"
                value={trade.takeProfit1?.toString() ?? "—"}
                mono
              />
              <Row
                label="Take Profit 2"
                value={trade.takeProfit2?.toString() ?? "—"}
                mono
              />
              <Row
                label="Salida"
                value={trade.exitPrice?.toString() ?? "—"}
                mono
              />
              <Row
                label="SL Pips"
                value={`${slPips.toFixed(1)}`}
                mono
              />
              <Row
                label="R:R TP1"
                value={rrTp1 != null ? rrTp1.toFixed(2) : "—"}
                mono
              />
              <Row
                label="R:R TP2"
                value={rrTp2 != null ? rrTp2.toFixed(2) : "—"}
                mono
              />
            </div>
          </Card>

          {/* NOTAS */}
          {(trade.preTradeNotes || trade.postTradeNotes) && (
            <Card title="Notas">
              {trade.preTradeNotes && (
                <div className="mb-4">
                  <div
                    className="text-mute uppercase mb-1.5"
                    style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                  >
                    Pre-trade
                  </div>
                  <p className="text-cream-muted text-sm whitespace-pre-wrap font-mono">
                    {trade.preTradeNotes}
                  </p>
                </div>
              )}
              {trade.postTradeNotes && (
                <div>
                  <div
                    className="text-mute uppercase mb-1.5"
                    style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                  >
                    Post-trade
                  </div>
                  <p className="text-cream-muted text-sm whitespace-pre-wrap font-mono">
                    {trade.postTradeNotes}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* TIEMPOS */}
          <Card title="Tiempos">
            <Row
              label="Entrada"
              value={format(trade.entryTime, "dd MMM yyyy · HH:mm")}
              mono
            />
            <Row
              label="Salida"
              value={
                trade.exitTime
                  ? format(trade.exitTime, "dd MMM yyyy · HH:mm")
                  : "—"
              }
              mono
            />
            <Row
              label="Duración"
              value={duration != null ? `${duration} min` : "—"}
              mono
            />
          </Card>
        </div>

        <div className="space-y-6">
          {trade.screenshotUrl ? (
            <div
              className="rounded-md overflow-hidden"
              style={{ border: "0.5px solid var(--color-graphite)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={trade.screenshotUrl}
                alt="screenshot"
                className="w-full"
              />
            </div>
          ) : (
            <div
              className="rounded-md p-6 text-xs text-mute text-center"
              style={{ border: "0.5px dashed var(--color-graphite)" }}
            >
              Sin screenshot
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-10 pt-6 flex items-center justify-between"
        style={{ borderTop: "0.5px solid var(--color-graphite)" }}
      >
        <TradeDeleteButton id={trade.id} />
        <Link
          href={`/trades/${trade.id}/edit`}
          className="rounded-md px-4 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98]"
          style={{
            background: "var(--color-rose)",
            color: "var(--color-onyx)",
            letterSpacing: "0.18em",
          }}
        >
          Editar trade
        </Link>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-coal rounded-md p-5"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <h2
        className="text-mute uppercase mb-4"
        style={{ fontSize: "10px", letterSpacing: "0.22em", fontWeight: 500 }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs text-mute">{label}</span>
      <span
        className={`text-cream ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ fontSize: "13px" }}
      >
        {value}
      </span>
    </div>
  );
}
