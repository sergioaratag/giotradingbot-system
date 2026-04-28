"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ConfluencePill } from "./ConfluencePill";
import { tradeCardClass } from "@/lib/style-helpers";
import {
  PAIRS,
  QUALITIES,
  SOURCES,
  KILLZONES,
  type TradeDTO,
} from "@/lib/trades";

type Metrics = {
  pnlMonth: number;
  winRate: number;
  profitFactor: number | null;
  tradesMonth: number;
};

const QUALITY_TONE: Record<string, string> = {
  HIGH: "var(--color-rose)",
  MEDIUM: "var(--color-violet)",
  LOW: "var(--color-mute)",
};

export function TradesList() {
  const router = useRouter();
  const search = useSearchParams();

  const [trades, setTrades] = useState<TradeDTO[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const pair = search.get("pair") ?? "";
  const source = search.get("source") ?? "";
  const quality = search.get("quality") ?? "";
  const killzone = search.get("killzone") ?? "";

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (pair) sp.set("pair", pair);
    if (source) sp.set("source", source);
    if (quality) sp.set("quality", quality);
    if (killzone) sp.set("killzone", killzone);
    return sp.toString();
  }, [pair, source, quality, killzone]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [t, m] = await Promise.all([
        fetch(`/api/trades${queryString ? "?" + queryString : ""}`).then((r) =>
          r.json(),
        ),
        fetch("/api/trades/metrics").then((r) => r.json()),
      ]);
      if (cancelled) return;
      setTrades(t.trades ?? []);
      setMetrics(m);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  function setFilter(key: string, value: string) {
    const sp = new URLSearchParams(search.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `/trades?${qs}` : "/trades");
  }

  const pnlMonth = metrics?.pnlMonth ?? 0;
  const winRate = metrics?.winRate ?? 0;
  const profitFactor = metrics?.profitFactor ?? null;

  return (
    <div className="max-w-7xl">
      <header className="flex items-end justify-between gap-4 pt-2 pb-8">
        <div>
          <h1
            className="text-cream"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "2rem",
              letterSpacing: "-0.01em",
            }}
          >
            Trades
          </h1>
          <p className="text-dust mt-1 text-sm">Tu journal de operaciones.</p>
        </div>
        <Link
          href="/trades/new"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98]"
          style={{
            background: "var(--color-rose)",
            color: "var(--color-onyx)",
            letterSpacing: "0.18em",
          }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nuevo trade manual
        </Link>
      </header>

      {/* MÉTRICAS */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Metric
          label="P&L Mes"
          value={pnlMonth === 0 ? "—" : `$${pnlMonth.toFixed(2)}`}
          tone={pnlMonth > 0 ? "rose" : pnlMonth < 0 ? "mute" : "cream"}
        />
        <Metric
          label="Win Rate"
          value={metrics ? `${(winRate * 100).toFixed(0)}%` : "—"}
        />
        <Metric
          label="Profit Factor"
          value={profitFactor != null ? profitFactor.toFixed(2) : "—"}
        />
        <Metric
          label="Trades Mes"
          value={metrics ? String(metrics.tradesMonth) : "—"}
        />
      </section>

      {/* FILTROS */}
      <section
        className="flex flex-wrap gap-2 mb-6"
        data-secondary="true"
      >
        <FilterSelect
          value={pair}
          onChange={(v) => setFilter("pair", v)}
          options={[{ v: "", l: "Todos los pares" }, ...PAIRS.map((p) => ({ v: p, l: p }))]}
        />
        <FilterSelect
          value={source}
          onChange={(v) => setFilter("source", v)}
          options={[{ v: "", l: "Bot + Manual" }, ...SOURCES.map((s) => ({ v: s, l: s }))]}
        />
        <FilterSelect
          value={quality}
          onChange={(v) => setFilter("quality", v)}
          options={[{ v: "", l: "Toda calidad" }, ...QUALITIES.map((q) => ({ v: q, l: q }))]}
        />
        <FilterSelect
          value={killzone}
          onChange={(v) => setFilter("killzone", v)}
          options={[{ v: "", l: "Toda killzone" }, ...KILLZONES.map((k) => ({ v: k, l: k }))]}
        />
        {loading && <span className="text-xs text-mute self-center">Cargando…</span>}
      </section>

      {/* TABLA / EMPTY */}
      {trades.length === 0 && !loading ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {trades.map((t) => (
            <TradeRow key={t.id} trade={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "cream",
}: {
  label: string;
  value: string;
  tone?: "cream" | "rose" | "mute";
}) {
  const cls = tone === "rose" ? "text-rose" : tone === "mute" ? "text-mute" : "text-cream";
  return (
    <div
      className="bg-coal rounded-lg p-5"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <div
        className="text-mute uppercase font-medium"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        {label}
      </div>
      <div className={`mt-2 font-mono text-2xl tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-coal text-dust text-xs rounded-md px-2.5 py-1.5 outline-none uppercase"
      style={{
        border: "0.5px solid var(--color-graphite)",
        letterSpacing: "0.12em",
      }}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

function TradeRow({ trade }: { trade: TradeDTO }) {
  const isHigh = trade.qualityRating === "HIGH";
  const r = trade.rAchieved ?? 0;
  const pnl = trade.pnlUSD ?? 0;
  const result =
    trade.tp2Hit ? "TP2" : trade.tp1Hit ? "TP1" : trade.beHit ? "BE" : trade.exitTime ? "SL" : "—";

  return (
    <Link
      href={`/trades/${trade.id}`}
      className={`relative block ${tradeCardClass(trade.qualityRating)} hover:bg-shadow/30 transition-colors`}
    >
      {isHigh && (
        <span
          aria-hidden
          className="absolute top-0 right-0"
          style={{
            width: "4px",
            height: "4px",
            background: "var(--color-gold)",
          }}
        />
      )}
      <div className="grid grid-cols-12 gap-3 items-center">
        <div className="col-span-2 font-mono text-xs text-dust">
          {format(new Date(trade.entryTime), "dd MMM HH:mm")}
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <span className="text-cream text-sm">{trade.pair}</span>
          <span
            className="rounded-sm px-1.5 py-0.5 uppercase font-mono"
            style={{
              fontSize: "9px",
              letterSpacing: "0.1em",
              background:
                trade.direction === "LONG"
                  ? "rgba(199,119,151,0.10)"
                  : "rgba(168,120,187,0.10)",
              color:
                trade.direction === "LONG"
                  ? "var(--color-rose)"
                  : "var(--color-violet)",
            }}
          >
            {trade.direction}
          </span>
        </div>
        <div className="col-span-1">
          {trade.qualityRating && (
            <span
              className="rounded-sm px-1.5 py-0.5 uppercase"
              style={{
                fontSize: "9px",
                letterSpacing: "0.1em",
                background: "var(--color-graphite)",
                color: QUALITY_TONE[trade.qualityRating],
              }}
            >
              {trade.qualityRating}
            </span>
          )}
        </div>
        <div className="col-span-1">
          {trade.killzone && (
            <span
              className="rounded-sm px-1.5 py-0.5 uppercase font-mono text-mute"
              style={{
                fontSize: "9px",
                letterSpacing: "0.1em",
                background: "var(--color-graphite)",
              }}
            >
              {trade.killzone}
            </span>
          )}
        </div>
        <div className="col-span-3 flex flex-wrap gap-1">
          {trade.confluences.slice(0, 4).map((k) => (
            <ConfluencePill key={k} conceptKey={k} showLabel={false} />
          ))}
          {trade.confluences.length > 4 && (
            <span className="text-xs text-mute self-center">
              +{trade.confluences.length - 4}
            </span>
          )}
        </div>
        <div className="col-span-1 text-right font-mono text-xs text-cream tabular-nums">
          {trade.rAchieved != null ? `${r > 0 ? "+" : ""}${r.toFixed(2)}R` : "—"}
        </div>
        <div className="col-span-1 text-right font-mono text-sm tabular-nums" style={{ color: pnl > 0 ? "var(--color-rose)" : pnl < 0 ? "var(--color-mute)" : "var(--color-cream)" }}>
          {trade.pnlUSD != null ? `${pnl > 0 ? "+" : ""}$${pnl.toFixed(0)}` : "—"}
        </div>
        <div className="col-span-1 text-right text-xs font-mono text-dust">
          {result}
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg p-12 text-center"
      style={{ border: "0.5px dashed var(--color-graphite)" }}
    >
      <TrendingUp
        className="mx-auto h-10 w-10 text-mute opacity-40"
        strokeWidth={1}
      />
      <p className="mt-4 text-sm text-dust">
        Aún no hay trades. Empieza agregando uno manual o conecta el bot.
      </p>
      <Link
        href="/trades/new"
        className="mt-5 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs uppercase font-medium"
        style={{
          background: "var(--color-rose)",
          color: "var(--color-onyx)",
          letterSpacing: "0.18em",
        }}
      >
        + Agregar mi primer trade
      </Link>
    </div>
  );
}
