"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/market-state";
import { useMarketState } from "@/hooks/useMarketState";
import { getQuoteOfDay } from "@/lib/quotes";

function greeting(hour: number) {
  if (hour < 6) return "Buenas noches";
  if (hour < 13) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function DashboardHero({ name }: { name: string }) {
  const market = useMarketState();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const quote = getQuoteOfDay(now ?? new Date());
  const localHour = (now ?? new Date()).getHours();
  const greet = greeting(localHour);

  const { title, subtitle, useQuote } = renderState(market);

  return (
    <section className="pt-12 pb-10 gio-slide-up">
      <div
        className="text-xs uppercase text-dust"
        style={{ letterSpacing: "0.22em" }}
      >
        {greet}, {name}
      </div>

      <h1
        className="mt-4 text-4xl font-normal text-cream"
        style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
        {subtitle?.highlight && !useQuote && (
          <>
            {" "}
            <span style={{ color: "var(--color-rose)" }}>
              {subtitle.highlight}
            </span>
          </>
        )}
      </h1>

      {useQuote ? (
        <p
          className="mt-5 text-sm text-dust"
          style={{
            fontFamily:
              "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "1.05rem",
          }}
        >
          “{quote.text}”{" "}
          <span className="text-mute not-italic">— {quote.author}</span>
        </p>
      ) : subtitle?.text ? (
        <p
          className="mt-3 text-sm text-dust"
          style={{ letterSpacing: "0.04em" }}
        >
          {subtitle.text}
        </p>
      ) : null}
    </section>
  );
}

type RenderResult = {
  title: string;
  subtitle: { text?: string; highlight?: string } | null;
  useQuote: boolean;
};

function renderState(
  market: ReturnType<typeof useMarketState>,
): RenderResult {
  if (!market) {
    return { title: "Mercado en sesión", subtitle: null, useQuote: false };
  }

  if (market.state === "killzone-active") {
    return {
      title: `Killzone ${market.currentKillzone} activa`,
      subtitle: market.closesIn
        ? { text: `Cierra en ${formatDuration(market.closesIn)}` }
        : null,
      useQuote: false,
    };
  }

  if (market.state === "session-active-no-kz") {
    return {
      title: `Mercado en sesión ${market.currentSession}`,
      subtitle: market.nextKillzone
        ? {
            text: `Próxima killzone: ${market.nextKillzone.name} en ${formatDuration(
              { hours: 0, minutes: market.nextKillzone.inMinutes },
            )}`,
          }
        : null,
      useQuote: false,
    };
  }

  if (market.state === "session-inactive") {
    return {
      title: "El mercado abre en",
      subtitle: market.opensIn
        ? { highlight: formatDuration(market.opensIn) }
        : null,
      useQuote: true,
    };
  }

  // weekend
  return {
    title: "Descansa, vuelvo el lunes",
    subtitle: null,
    useQuote: true,
  };
}
