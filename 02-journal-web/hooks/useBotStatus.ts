"use client";

import { useCallback, useEffect, useState } from "react";

export type BotStatus = {
  enabled: boolean;
  killSwitch: boolean;
  loading: boolean;
};

const POLL_MS = 30_000;

export function useBotStatus() {
  const [state, setState] = useState<BotStatus>({
    enabled: false,
    killSwitch: false,
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
