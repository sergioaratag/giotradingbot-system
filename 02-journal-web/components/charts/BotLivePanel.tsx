"use client";

import { useEffect, useRef, useState } from "react";
import type { BotStateRow, FvgState, SweepState } from "@/lib/bot-state";
import { ICT_LESSONS, inferPhase } from "@/lib/bot-state";

const POLL_MS = 3000;
const STALE_MS = 45_000; // sin updates por >45s → "sin datos recientes"

type NarrationEvent = {
  id: number;
  text: string;
  reasoning: string | null;
  nextStep: string | null;
  ts: number;
};

function biasMeta(bias: string | null): { label: string; arrow: string; color: string } {
  switch ((bias ?? "").toUpperCase()) {
    case "BULLISH":
      return { label: "BULLISH", arrow: "▲", color: "var(--color-gold)" };
    case "BEARISH":
      return { label: "BEARISH", arrow: "▼", color: "var(--color-rose)" };
    default:
      return { label: "NEUTRAL", arrow: "—", color: "var(--color-mute)" };
  }
}

function killzoneActive(kz: string | null): boolean {
  return !!kz && kz !== "OUTSIDE";
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.round(s / 60);
  return `hace ${m}m`;
}

export function BotLivePanel({ symbol }: { symbol: "EURUSD" | "GBPUSD" }) {
  const [state, setState] = useState<BotStateRow | null>(null);
  const [events, setEvents] = useState<NarrationEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, force] = useState(0); // re-render periódico para timeAgo/stale
  const seqRef = useRef(0);
  const lastActionRef = useRef<string | null>(null);

  // Reset del feed al cambiar de símbolo.
  useEffect(() => {
    setEvents([]);
    setState(null);
    setLoaded(false);
    lastActionRef.current = null;
  }, [symbol]);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/bot/state", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const { states } = (await res.json()) as { states: BotStateRow[] };
        if (!alive) return;
        const row = states.find((s) => s.symbol === symbol) ?? null;
        setLoaded(true);
        setState(row);
        if (row?.currentAction && row.currentAction !== lastActionRef.current) {
          lastActionRef.current = row.currentAction;
          seqRef.current += 1;
          const id = seqRef.current;
          const ts = Date.parse(row.updatedAt) || Date.now();
          setEvents((prev) =>
            [{ id, text: row.currentAction!, reasoning: row.reasoning, nextStep: row.nextStep, ts }, ...prev].slice(0, 8),
          );
        }
      } catch {
        /* fail-soft: reintenta al próximo tick */
      }
    }
    poll();
    const tPoll = setInterval(poll, POLL_MS);
    const tTick = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      alive = false;
      clearInterval(tPoll);
      clearInterval(tTick);
    };
  }, [symbol]);

  const stale = state ? Date.now() - (Date.parse(state.updatedAt) || 0) > STALE_MS : false;
  const kzOn = killzoneActive(state?.killzone ?? null);
  const phase = inferPhase(state?.currentAction);
  const lesson = ICT_LESSONS[phase];

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full bg-onyx">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-cream" style={{ letterSpacing: "0.06em" }}>
          🤖 El bot está trabajando
        </h2>
        {loaded && state && (
          <span className="text-[10px] uppercase text-mute" style={{ letterSpacing: "0.16em" }}>
            {stale ? "sin datos recientes" : timeAgo(Date.parse(state.updatedAt) || Date.now())}
          </span>
        )}
      </div>

      {!loaded ? (
        <Empty text={`Conectando con el bot…`} />
      ) : !state ? (
        <Empty
          text={`El bot todavía no reportó estado para ${symbol}. Se enciende cuando el EA (recompilado con BotState) esté corriendo.`}
        />
      ) : (
        <>
          {/* Estado */}
          <Section title="Estado">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: kzOn ? "var(--color-profit-bright)" : "var(--color-loss)",
                  boxShadow: kzOn ? "0 0 0 3px rgba(216,139,168,0.18)" : "none",
                }}
                {...(kzOn ? { "data-pulse": true } : {})}
              />
              <span className="text-sm text-cream">
                {kzOn ? `Killzone ${state.killzone} activa` : "Fuera de killzone"}
              </span>
              {kzOn && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-profit-bright)" }} />
              )}
            </div>
            <BiasRow label={`Bias ${symbol} H4`} bias={state.biasH4} />
            {state.biasD1 && <BiasRow label={`Bias ${symbol} D1`} bias={state.biasD1} />}
            {state.chochState && state.chochState !== "NONE" && (
              <div className="mt-2 text-xs text-cream-muted">
                CHoCH: <span style={{ color: "var(--color-gold)" }}>{state.chochState}</span>
              </div>
            )}
          </Section>

          {/* Narración en vivo */}
          <Section title="Narración en vivo">
            {events.length === 0 ? (
              <p className="text-xs text-mute">Esperando la primera lectura…</p>
            ) : (
              <div className="space-y-2">
                {events.map((e, i) => {
                  const top = i === 0;
                  return (
                    <div
                      key={e.id}
                      className="p-3 rounded-md transition-opacity duration-500"
                      style={{
                        borderLeft: `2px solid ${top ? "var(--color-rose)" : "var(--color-graphite)"}`,
                        background: top ? "var(--color-coal)" : "transparent",
                        opacity: top ? 1 : 0.55,
                      }}
                    >
                      <div className="text-[10px] text-mute" style={{ letterSpacing: "0.08em" }}>
                        {timeAgo(e.ts)}
                      </div>
                      <div className="text-sm text-cream mt-1">{e.text}</div>
                      {top && e.reasoning && (
                        <div className="text-xs text-cream-muted mt-2 italic leading-relaxed">{e.reasoning}</div>
                      )}
                      {top && e.nextStep && (
                        <div className="text-xs mt-2" style={{ color: "var(--color-gold)" }}>
                          → {e.nextStep}
                        </div>
                      )}
                      {top && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-rose)" }} />
                          <span className="text-[10px] uppercase" style={{ color: "var(--color-rose)", letterSpacing: "0.16em" }}>
                            En vivo
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* FVGs activos */}
          <Section title="FVGs activos">
            {state.fvgs.length === 0 ? (
              <p className="text-xs text-mute">Ninguno detectado ahora.</p>
            ) : (
              <div className="space-y-2">
                {state.fvgs.map((f, i) => (
                  <FvgRow key={i} symbol={symbol} fvg={f} />
                ))}
              </div>
            )}
          </Section>

          {/* Sweeps del día */}
          <Section title="Sweeps del día">
            {state.sweeps.length === 0 ? (
              <p className="text-xs text-mute">Sin sweeps registrados.</p>
            ) : (
              <div className="space-y-1.5">
                {state.sweeps.map((s, i) => (
                  <SweepRow key={i} symbol={symbol} sweep={s} />
                ))}
              </div>
            )}
          </Section>

          {/* Mini-clase ICT */}
          <div className="p-4 rounded-lg" style={{ background: "var(--color-coal)", border: "0.5px solid var(--color-graphite)" }}>
            <div className="text-[10px] uppercase mb-2" style={{ color: "var(--color-rose)", letterSpacing: "0.18em" }}>
              📚 Mini-clase
            </div>
            <div className="text-sm font-medium text-cream mb-1.5">{lesson.title}</div>
            <div className="text-xs text-cream-muted leading-relaxed">{lesson.body}</div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-md" style={{ background: "var(--color-coal)", border: "0.5px solid var(--color-graphite)" }}>
      <div className="text-[10px] uppercase text-mute mb-2.5" style={{ letterSpacing: "0.2em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function BiasRow({ label, bias }: { label: string; bias: string | null }) {
  const m = biasMeta(bias);
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-cream-muted">{label}</span>
      <span className="font-medium" style={{ color: m.color, letterSpacing: "0.04em" }}>
        {m.label} {m.arrow}
      </span>
    </div>
  );
}

function FvgRow({ symbol, fvg }: { symbol: string; fvg: FvgState }) {
  const q = Math.max(0, Math.min(10, fvg.quality ?? 0));
  const filled = Math.round((q / 10) * 5);
  const price = fvg.top != null ? fvg.top : fvg.bot;
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between text-cream">
        <span>
          {symbol.slice(0, 3)} {fvg.tf} {fvg.side}
          {price != null && <span className="text-cream-muted"> @ {price}</span>}
        </span>
        <span className="text-mute">{fvg.state ?? ""}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="font-mono tracking-widest" style={{ color: "var(--color-rose)" }}>
          {"▓".repeat(filled)}
          <span className="text-dust">{"░".repeat(5 - filled)}</span>
        </span>
        <span className="text-[10px] text-mute">Q{q}/10</span>
      </div>
    </div>
  );
}

function SweepRow({ symbol, sweep }: { symbol: string; sweep: SweepState }) {
  return (
    <div className="flex items-center gap-2 text-xs text-cream">
      <span style={{ color: "var(--color-profit-bright)" }}>✓</span>
      <span>
        {symbol.slice(0, 3)} {sweep.level ?? sweep.type} {sweep.tf}
      </span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="flex items-center justify-center text-center text-xs text-mute px-4 py-10 rounded-md"
      style={{ background: "var(--color-coal)", border: "0.5px dashed var(--color-graphite)" }}
    >
      {text}
    </div>
  );
}
