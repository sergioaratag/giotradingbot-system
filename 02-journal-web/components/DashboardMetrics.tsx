"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "./MetricCard";

type Metrics = {
  pnlToday: number;
  tradesToday: number;
  dailyUsedPct: number;
  winRate: number;
  closedTrades: number;
};

const DAILY_MAX_PCT = 1.5;

export function DashboardMetrics() {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trades/metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setM(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const pnl = m?.pnlToday ?? 0;
  const tradesToday = m?.tradesToday ?? 0;
  const used = m?.dailyUsedPct ?? 0;
  const wr = m?.winRate ?? 0;

  return (
    <section
      data-secondary="true"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <MetricCard
        label="P&L Hoy"
        value={m == null ? "—" : pnl === 0 ? "—" : `$${pnl.toFixed(2)}`}
        tone={pnl > 0 ? "profit" : pnl < 0 ? "loss" : "default"}
      />
      <MetricCard
        label="Trades"
        value={m == null ? "—" : tradesToday.toString()}
        sub="ejecutados hoy"
      />
      <MetricCard
        label="Daily Used"
        value={
          m == null
            ? "—"
            : `${used.toFixed(1)}/${DAILY_MAX_PCT.toFixed(1)}`
        }
        progress={m == null ? undefined : used / DAILY_MAX_PCT}
      />
      <MetricCard
        label="Win Rate"
        value={m == null || m.closedTrades === 0 ? "—" : `${(wr * 100).toFixed(0)}%`}
      />
    </section>
  );
}
