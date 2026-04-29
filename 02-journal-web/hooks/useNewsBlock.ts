"use client";

import { useEffect, useState } from "react";

export type NewsBlockState = {
  isBlocked: boolean;
  reason?: string;
  until?: Date;
  next?: { title: string; scheduledAt: Date };
  loading: boolean;
};

type ApiToday = {
  activeBlock: { eventId: string; title: string; until: string } | null;
  nextEvent: { id: string; title: string; scheduledAt: string } | null;
};

const POLL_MS = 60_000;

export function useNewsBlock(): NewsBlockState {
  const [state, setState] = useState<NewsBlockState>({
    isBlocked: false,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch("/api/news/today", { cache: "no-store" });
        if (!res.ok) {
          if (alive) setState((s) => ({ ...s, loading: false }));
          return;
        }
        const data: ApiToday = await res.json();
        if (!alive) return;

        const next = data.nextEvent
          ? {
              title: data.nextEvent.title,
              scheduledAt: new Date(data.nextEvent.scheduledAt),
            }
          : undefined;

        if (data.activeBlock) {
          setState({
            isBlocked: true,
            reason: data.activeBlock.title,
            until: new Date(data.activeBlock.until),
            next,
            loading: false,
          });
        } else {
          setState({ isBlocked: false, next, loading: false });
        }
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false }));
      }
    }

    tick();
    timer = setInterval(tick, POLL_MS);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return state;
}
