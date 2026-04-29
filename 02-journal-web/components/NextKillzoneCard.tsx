"use client";

import { formatDuration, minutesToDuration } from "@/lib/market-state";
import { useMarketState } from "@/hooks/useMarketState";

export function NextKillzoneCard() {
  const market = useMarketState();

  return (
    <div
      className="bg-coal rounded-lg p-5 flex items-center gap-3"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full gio-pulse"
        style={{ background: "var(--color-rose)" }}
      />
      <div className="flex-1 text-sm">{renderBody(market)}</div>
    </div>
  );
}

function renderBody(market: ReturnType<typeof useMarketState>) {
  if (!market) return <span className="text-dust">Cargando…</span>;

  if (market.state === "killzone-active") {
    return (
      <>
        <span className="text-cream-muted">Killzone activa:</span>{" "}
        <span className="text-cream">{market.currentKillzone}</span>{" "}
        <span className="text-dust">
          · cierra en{" "}
          {market.closesIn ? formatDuration(market.closesIn) : "—"}
        </span>
      </>
    );
  }

  if (
    market.state === "session-active-no-kz" ||
    market.state === "session-inactive"
  ) {
    if (!market.nextKillzone) {
      return <span className="text-dust">—</span>;
    }
    return (
      <>
        <span className="text-cream-muted">Próxima killzone:</span>{" "}
        <span className="text-cream">{market.nextKillzone.name}</span>{" "}
        <span className="text-dust">
          en{" "}
          {formatDuration(minutesToDuration(market.nextKillzone.inMinutes))}
        </span>
      </>
    );
  }

  // weekend
  return (
    <>
      <span className="text-cream-muted">Próxima killzone:</span>{" "}
      <span className="text-cream">London KZ</span>{" "}
      <span className="text-dust">· lunes 02:00 NY</span>
    </>
  );
}
