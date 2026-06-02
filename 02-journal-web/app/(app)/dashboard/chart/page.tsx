"use client";

import { useState } from "react";
import TradingViewWidget from "@/components/charts/TradingViewWidget";

const SYMBOLS = [
  { value: "FX:EURUSD", label: "EUR/USD" },
  { value: "FX:GBPUSD", label: "GBP/USD" },
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

  return (
    // -mx-8 -my-8 cancela el padding del <main> del layout para que el chart
    // pueda ocupar todo el ancho/alto disponible. h-[calc(100vh-3.5rem)]
    // descuenta el Header sticky.
    <div className="-mx-8 -my-8 flex flex-col h-[calc(100vh-3.5rem)] bg-onyx">
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

      <div className="flex-1 min-h-0">
        <TradingViewWidget symbol={symbol} interval={interval} theme="dark" />
      </div>
    </div>
  );
}
