"use client";

import { useEffect, useState } from "react";
import { CandleChart } from "@/components/charts/CandleChart";
import { BotLivePanel } from "@/components/charts/BotLivePanel";
import { BotElementModal } from "@/components/charts/BotElementModal";
import type { BotStateRow } from "@/lib/bot-state";
import type { BotElement } from "@/lib/ict-modals";

const SYMBOLS = [
  { pair: "EURUSD" as const, label: "EUR/USD" },
  { pair: "GBPUSD" as const, label: "GBP/USD" },
];
const TIMEFRAMES = ["M3", "M5", "M15", "H1", "H4"];

export default function ChartPage() {
  const [pair, setPair] = useState<"EURUSD" | "GBPUSD">("EURUSD");
  const [timeframe, setTimeframe] = useState("M5");
  const [states, setStates] = useState<BotStateRow[]>([]);
  const [modalEl, setModalEl] = useState<BotElement | null>(null);

  // Polling del estado del bot (compartido por chart + panel).
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/bot/state", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const { states } = (await res.json()) as { states: BotStateRow[] };
        if (alive) setStates(states);
      } catch {
        /* reintenta */
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const current = states.find((s) => s.symbol === pair) ?? null;

  return (
    <div className="-mx-8 -my-8 flex flex-col h-[calc(100vh-3.5rem)] bg-onyx">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-graphite">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-medium text-cream tabular-nums" style={{ letterSpacing: "0.5px" }}>
            {pair.slice(0, 3)}/{pair.slice(3)}
          </h1>
          <BiasChip bias={current?.biasH4 ?? null} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {SYMBOLS.map((s) => (
              <button
                key={s.pair}
                onClick={() => setPair(s.pair)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  pair === s.pair
                    ? "bg-rose-deep text-cream font-medium"
                    : "bg-shadow/40 text-cream-muted hover:text-cream hover:bg-shadow"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                  timeframe === tf
                    ? "bg-coal text-cream font-medium"
                    : "text-cream-muted hover:text-cream hover:bg-shadow/40"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart + panel */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-h-[55vh] lg:min-h-0">
          <CandleChart pair={pair} timeframe={timeframe} botState={current} onElementClick={setModalEl} />
        </div>
        <div className="flex-1 lg:flex-none lg:w-[372px] min-h-0 border-t lg:border-t-0 lg:border-l border-graphite">
          <BotLivePanel symbol={pair} state={current} onElementClick={setModalEl} />
        </div>
      </div>

      <BotElementModal element={modalEl} onClose={() => setModalEl(null)} />
    </div>
  );
}

function BiasChip({ bias }: { bias: string | null }) {
  const b = (bias ?? "").toUpperCase();
  const view =
    b === "BULLISH"
      ? { txt: "📈 Alcista H4", color: "var(--color-gold)" }
      : b === "BEARISH"
        ? { txt: "📉 Bajista H4", color: "var(--color-rose)" }
        : { txt: "Bias H4 —", color: "var(--color-mute)" };
  return (
    <span
      className="px-2.5 py-1 rounded-md text-xs font-medium"
      style={{ color: view.color, background: "rgba(255,255,255,0.03)", border: "0.5px solid var(--color-graphite)" }}
    >
      {view.txt}
    </span>
  );
}
