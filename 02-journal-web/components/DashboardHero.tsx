"use client";

import { useEffect, useState } from "react";
import {
  activeKillzone,
  nextKillzone,
  formatHM,
  nyParts,
  isWeekend,
} from "@/lib/killzones";
import { getQuoteOfDay } from "@/lib/quotes";

function greeting(hour: number) {
  if (hour < 6) return "Buenas noches";
  if (hour < 13) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function DashboardHero({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const quote = getQuoteOfDay(now ?? new Date());
  const localHour = (now ?? new Date()).getHours();
  const greet = greeting(localHour);

  let title = "Mercado en sesión";
  let highlight: string | null = null;

  if (now) {
    const ny = nyParts(now);
    if (isWeekend(ny.weekday)) {
      title = "Descansa, vuelvo el lunes";
    } else {
      const kz = activeKillzone(now);
      if (kz) {
        title = `Killzone ${kz.label} activa`;
      } else {
        const nx = nextKillzone(now);
        if (nx) {
          title = "El mercado abre en";
          highlight = formatHM(nx.minutesUntil);
        }
      }
    }
  }

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
          fontFamily:
            "var(--font-fraunces), 'Fraunces', Georgia, serif",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
        {highlight && (
          <>
            {" "}
            <span style={{ color: "var(--color-rose)" }}>{highlight}</span>
          </>
        )}
      </h1>

      <p
        className="mt-5 text-sm text-dust"
        style={{
          fontFamily:
            "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontSize: "1.05rem",
        }}
      >
        “{quote.text}” <span className="text-mute not-italic">— {quote.author}</span>
      </p>
    </section>
  );
}
