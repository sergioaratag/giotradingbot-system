"use client";

import { useEffect, useState } from "react";
import { getMarketState, type MarketState } from "@/lib/market-state";

export function useMarketState(): MarketState | null {
  // Empieza en null para evitar mismatch de SSR (la hora del servidor != la del cliente).
  const [state, setState] = useState<MarketState | null>(null);

  useEffect(() => {
    setState(getMarketState());
    const id = window.setInterval(() => {
      setState(getMarketState());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return state;
}
