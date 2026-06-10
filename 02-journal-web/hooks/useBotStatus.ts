"use client";

import { useCallback, useEffect, useState } from "react";

export type BotStatus = {
  enabled: boolean;
  killSwitch: boolean;
  lastSeen: string | null; // ISO del último reporte del EA (heartbeat)
  loading: boolean;
};

const POLL_MS = 30_000;
// El EA reporta cada ~5s; >2min sin señal = lo consideramos "sin señal".
export const BOT_ONLINE_THRESHOLD_MS = 120_000;

export function useBotStatus() {
  const [state, setState] = useState<BotStatus>({
    enabled: false,
    killSwitch: false,
    lastSeen: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/status", { cache: "no-store" });
      if (!res.ok) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const data = await res.json();
      setState({
        enabled: !!data.enabled,
        killSwitch: !!data.killSwitch,
        lastSeen: data.lastSeen ?? null,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await refresh();
    })();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refresh]);

  return { ...state, refresh };
}
