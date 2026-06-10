"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import TradingViewWidget from "@/components/charts/TradingViewWidget";
import { BotLivePanel } from "@/components/charts/BotLivePanel";
import { openTradingView } from "@/lib/open-tradingview";

const SYMBOLS = [
  { value: "FX:EURUSD", pair: "EURUSD" as const, label: "EUR/USD" },
  { value: "FX:GBPUSD", pair: "GBPUSD" as const, label: "GBP/USD" },
];

const INTERVALS = [
  { value: "1", label: "M1" },
  { value: "5", label: "M5" },
  { value: "15", label: "M15" },
  { value: "60", label: "H1" },
  { value: "240", label: "H4" },
  { value: "D", label: "D1" },
];

export default function ChartPage() {
  const [symbol, setSymbol] = useState(SYMBOLS[0].value);
  const [interval, setInterval] = useState("5");
  const pair = (SYMBOLS.find((s) => s.value === symbol)?.pair ?? "EURUSD") as "EURUSD" | "GBPUSD";

  return (
    <div className="-mx-8 -my-8 flex flex-col h-[calc(100vh-3.5rem)] bg-onyx">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-graphite">
        <h1 className="text-lg font-medium text-cream" style={{ letterSpacing: "0.3px" }}>
          Análisis en Vivo
        </h1>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {SYMBOLS.map((s) => {
              const active = symbol === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setSymbol(s.value)}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    active
                      ? "bg-rose-deep text-cream font-medium"
                      : "bg-shadow/40 text-cream-muted hover:text-cream hover:bg-shadow"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-0.5">
            {INTERVALS.map((tf) => {
              const active = interval === tf.value;
              return (
                <button
                  key={tf.value}
                  onClick={() => setInterval(tf.value)}
                  className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                    active
                      ? "bg-coal text-cream font-medium"
                      : "text-cream-muted hover:text-cream hover:bg-shadow/40"
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart + panel live */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-h-[55vh] lg:min-h-0">
          <TradingViewWidget symbol={symbol} interval={interval} theme="dark" />
        </div>
        <div className="flex-1 lg:flex-none lg:w-[372px] min-h-0 border-t lg:border-t-0 lg:border-l border-graphite">
          <BotLivePanel symbol={pair} />
        </div>
      </div>

      {/* Botón grande: abrir en TradingView */}
      <div className="px-6 py-3 border-t border-graphite">
        <button
          type="button"
          onClick={() => openTradingView(pair)}
          className="w-full inline-flex flex-col items-center justify-center gap-1 rounded-xl py-4 transition-transform active:scale-[0.99] hover:scale-[1.005]"
          style={{
            background: "linear-gradient(90deg, rgba(199,119,151,0.16), rgba(168,95,126,0.16))",
            border: "0.5px solid rgba(199,119,151,0.30)",
          }}
        >
          <span className="inline-flex items-center gap-2 text-cream font-medium">
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
            Abrir {pair} en TradingView (tu cuenta)
          </span>
          <span className="text-[11px] text-mute">
            Se abre en la app en mobile · en web en desktop
          </span>
        </button>
      </div>
    </div>
  );
}
