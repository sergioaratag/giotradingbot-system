"use client";

import { useEffect, useRef, useState } from "react";
import type { BotStateRow, FvgState, SweepState } from "@/lib/bot-state";
import { ICT_LESSONS, inferPhase } from "@/lib/bot-state";
import type { BotElement } from "@/lib/ict-modals";
import { killzoneLabelEs } from "@/lib/killzones";

const STALE_MS = 45_000;

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
      return { label: "Alcista", arrow: "▲", color: "var(--color-gold)" };
    case "BEARISH":
      return { label: "Bajista", arrow: "▼", color: "var(--color-rose)" };
    default:
      return { label: "Neutral", arrow: "—", color: "var(--color-mute)" };
  }
}

function killzoneActive(kz: string | null): boolean {
  return !!kz && kz !== "OUTSIDE" && kz !== "SESSION_NO_KZ";
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  return `hace ${Math.round(s / 60)}m`;
}

function hora(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString("es-BO", { hour12: false }) : "—";
}

export function BotLivePanel({
  symbol,
  state,
  onElementClick,
}: {
  symbol: "EURUSD" | "GBPUSD";
  state: BotStateRow | null;
  onElementClick: (el: BotElement) => void;
}) {
  const [events, setEvents] = useState<NarrationEvent[]>([]);
  const [, force] = useState(0);
  const seqRef = useRef(0);
  const lastActionRef = useRef<string | null>(null);

  // Reset del feed al cambiar de símbolo.
  useEffect(() => {
    setEvents([]);
    lastActionRef.current = null;
  }, [symbol]);

  // Acumular narración cuando cambia la acción del bot.
  useEffect(() => {
    if (state?.currentAction && state.currentAction !== lastActionRef.current) {
      lastActionRef.current = state.currentAction;
      seqRef.current += 1;
      const id = seqRef.current;
      const ts = Date.parse(state.updatedAt) || Date.now();
      setEvents((prev) =>
        [{ id, text: state.currentAction!, reasoning: state.reasoning, nextStep: state.nextStep, ts }, ...prev].slice(0, 8),
      );
    }
  }, [state?.currentAction, state?.updatedAt, state?.reasoning, state?.nextStep]);

  // Tick para timeAgo/stale.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stale = state ? Date.now() - (Date.parse(state.updatedAt) || 0) > STALE_MS : false;
  const kzOn = killzoneActive(state?.killzone ?? null);
  const phase = inferPhase(state?.currentAction);
  const lesson = ICT_LESSONS[phase];

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full bg-onyx">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-cream" style={{ letterSpacing: "0.06em" }}>
          🤖 El bot está trabajando
        </h2>
        {state && (
          <span className="text-[10px] uppercase text-mute" style={{ letterSpacing: "0.16em" }}>
            {stale ? "sin datos recientes" : timeAgo(Date.parse(state.updatedAt) || Date.now())}
          </span>
        )}
      </div>

      {!state ? (
        <Empty text={`El bot todavía no reportó estado para ${symbol}.`} />
      ) : (
        <>
          {/* Estado */}
          <Section title="Estado">
            <button
              className="flex items-center gap-2 mb-3 w-full text-left"
              onClick={() => onElementClick({ kind: "KILLZONE", name: state.killzone })}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: kzOn ? "var(--color-profit-bright)" : "var(--color-loss)" }}
              />
              <span className="text-sm text-cream">{killzoneLabelEs(state.killzone)}{kzOn ? " activa" : ""}</span>
              {kzOn && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-profit-bright)" }} />}
            </button>
            <BiasRow label={`Bias ${symbol} H4`} bias={state.biasH4} onClick={() => onElementClick({ kind: "BIAS", bias: state.biasH4, tf: "H4" })} />
            {state.biasD1 && <BiasRow label={`Bias ${symbol} D1`} bias={state.biasD1} onClick={() => onElementClick({ kind: "BIAS", bias: state.biasD1, tf: "D1" })} />}
            {state.chochState && state.chochState !== "NONE" && (
              <div className="mt-2 text-xs text-cream-muted">
                CHoCH: <span style={{ color: "var(--color-gold)" }}>{state.chochState === "CONFIRMED" ? "Confirmado" : "Pendiente"}</span>
              </div>
            )}
          </Section>

          {/* Narración */}
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
                      <div className="text-[10px] text-mute">{timeAgo(e.ts)}</div>
                      <div className="text-sm text-cream mt-1">{e.text}</div>
                      {top && e.reasoning && <div className="text-xs text-cream-muted mt-2 italic leading-relaxed">{e.reasoning}</div>}
                      {top && e.nextStep && <div className="text-xs mt-2" style={{ color: "var(--color-gold)" }}>→ {e.nextStep}</div>}
                      {top && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-rose)" }} />
                          <span className="text-[10px] uppercase" style={{ color: "var(--color-rose)", letterSpacing: "0.16em" }}>En vivo</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* FVGs */}
          <Section title={`FVGs activos (${state.fvgs.length})`}>
            {state.fvgs.length === 0 ? (
              <p className="text-xs text-mute">Ninguno detectado ahora.</p>
            ) : (
              <div className="space-y-2">
                {state.fvgs.map((f, i) => (
                  <FvgRow key={i} fvg={f} onClick={() => onElementClick({ kind: "FVG", fvg: f })} />
                ))}
              </div>
            )}
          </Section>

          {/* Sweeps */}
          <Section title={`Sweeps del día (${state.sweeps.length})`}>
            {state.sweeps.length === 0 ? (
              <p className="text-xs text-mute">Sin sweeps registrados.</p>
            ) : (
              <div className="space-y-1.5">
                {state.sweeps.map((s, i) => (
                  <SweepRow key={i} sweep={s} onClick={() => onElementClick({ kind: "SWEEP", sweep: s })} />
                ))}
              </div>
            )}
          </Section>

          {/* Mini-clase */}
          <div className="p-4 rounded-lg" style={{ background: "var(--color-coal)", border: "0.5px solid var(--color-graphite)" }}>
            <div className="text-[10px] uppercase mb-2" style={{ color: "var(--color-rose)", letterSpacing: "0.18em" }}>📚 Mini-clase</div>
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
      <div className="text-[10px] uppercase text-mute mb-2.5" style={{ letterSpacing: "0.2em" }}>{title}</div>
      {children}
    </div>
  );
}

function BiasRow({ label, bias, onClick }: { label: string; bias: string | null; onClick: () => void }) {
  const m = biasMeta(bias);
  return (
    <button onClick={onClick} className="flex items-center justify-between text-sm w-full hover:opacity-80 transition-opacity">
      <span className="text-cream-muted">{label}</span>
      <span className="font-medium" style={{ color: m.color }}>{m.label} {m.arrow}</span>
    </button>
  );
}

function FvgRow({ fvg, onClick }: { fvg: FvgState; onClick: () => void }) {
  const q = Math.max(0, Math.min(10, fvg.quality ?? 0));
  const filled = Math.round((q / 10) * 5);
  const sideEs = fvg.side === "BULL" ? "Alcista" : "Bajista";
  const estado = fvg.state === "MITIGATING" ? "Mitigándose" : fvg.state === "IFVG" ? "IFVG" : "Activo";
  return (
    <button onClick={onClick} className="text-xs w-full text-left hover:opacity-80 transition-opacity">
      <div className="flex items-center justify-between text-cream">
        <span>📦 FVG {sideEs} @ {fvg.top?.toFixed(5)} → {fvg.bot?.toFixed(5)}</span>
        <span className="text-mute">{estado}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-mute">
        <span className="font-mono tracking-widest" style={{ color: "var(--color-rose)" }}>
          {"▓".repeat(filled)}<span className="text-dust">{"░".repeat(5 - filled)}</span>
        </span>
        <span className="text-[10px]">{fvg.tf} · Q{q}/10</span>
      </div>
    </button>
  );
}

function SweepRow({ sweep, onClick }: { sweep: SweepState; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-xs text-cream w-full text-left hover:opacity-80 transition-opacity">
      <span style={{ color: "var(--color-profit-bright)" }}>📌</span>
      <span>
        {sweep.level} {sweep.price != null ? `@ ${sweep.price.toFixed(5)}` : ""} · {sweep.tf}
        {sweep.detectedAt ? ` · ${hora(sweep.detectedAt)}` : ""}
      </span>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center text-center text-xs text-mute px-4 py-10 rounded-md" style={{ background: "var(--color-coal)", border: "0.5px dashed var(--color-graphite)" }}>
      {text}
    </div>
  );
}
