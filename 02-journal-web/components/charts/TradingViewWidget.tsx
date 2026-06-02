"use client";

import { memo, useEffect, useRef } from "react";

interface TradingViewWidgetProps {
  symbol: string;          // "FX:EURUSD", "FX:GBPUSD"
  interval?: string;       // "1" | "5" | "15" | "60" | "240" | "D"
  theme?: "light" | "dark";
}

// Embedding del Advanced Real-Time Chart Widget de TradingView (gratis,
// solo visualizacion). El script se inyecta una vez por (symbol, interval,
// theme) y se limpia al desmontar/cambiar.
//
// Fase 2A: solo el chart. Marcas del bot (trades, FVGs, niveles) vienen en
// Fase 2B con drawings sobre el widget o un overlay propio.
function TradingViewWidgetImpl({
  symbol,
  interval = "5",
  theme = "dark",
}: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;

    node.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "America/New_York",
      theme,
      style: "1", // velas
      locale: "es",
      enable_publishing: false,
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      details: true,
      hotlist: false,
      calendar: true,
      support_host: "https://www.tradingview.com",
    });

    node.appendChild(script);

    return () => {
      node.innerHTML = "";
    };
  }, [symbol, interval, theme]);

  return (
    <div
      ref={container}
      className="tradingview-widget-container h-full w-full"
    />
  );
}

export default memo(TradingViewWidgetImpl);
