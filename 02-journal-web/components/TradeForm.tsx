"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PAIRS,
  QUALITY_RISK,
  KILLZONES,
  pipsBetween,
  calcRR,
} from "@/lib/trades";
import { ConfluenceSelector } from "./ConfluenceSelector";
import { ConfluencePill } from "./ConfluencePill";
import { playSound } from "@/lib/sounds";
import { activeKillzone, nyParts, isWeekend } from "@/lib/killzones";
import type { TradeDTO } from "@/lib/trades";

type Mode = "create" | "edit";

const KZ_MAP: Record<string, string> = {
  LDN: "LDN-KZ",
  NY_AM: "NY-AM-KZ",
  NY_PM: "NY-PM-KZ",
};

function deriveKillzoneFromDate(date: Date): string {
  const ny = nyParts(date);
  if (isWeekend(ny.weekday)) return "OUTSIDE";
  const kz = activeKillzone(date);
  if (kz) return KZ_MAP[kz.id] ?? "OUTSIDE";
  // Approximate special slots
  const t = ny.totalMin;
  if (t >= 19 * 60 && t < 22 * 60) return "ASIA-KZ";
  if (t >= 11 * 60 && t < 12 * 60 + 30) return "NY-LUNCH";
  return "OUTSIDE";
}

export function TradeForm({
  mode,
  initial,
}: {
  mode: Mode;
  initial?: TradeDTO;
}) {
  const router = useRouter();

  const [pair, setPair] = useState<string>(initial?.pair ?? "EUR-USD");
  const [direction, setDirection] = useState<"LONG" | "SHORT">(
    (initial?.direction as "LONG" | "SHORT") ?? "LONG",
  );
  const [entryTime, setEntryTime] = useState<string>(
    initial?.entryTime
      ? new Date(initial.entryTime).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
  );
  const [killzone, setKillzone] = useState<string>(
    initial?.killzone ?? deriveKillzoneFromDate(new Date()),
  );
  const [killzoneTouched, setKillzoneTouched] = useState(!!initial);

  const [confluences, setConfluences] = useState<string[]>(
    initial?.confluences ?? [],
  );

  const [entryPrice, setEntryPrice] = useState<string>(
    initial?.entryPrice?.toString() ?? "",
  );
  const [stopLoss, setStopLoss] = useState<string>(
    initial?.stopLoss?.toString() ?? "",
  );
  const [tp1, setTp1] = useState<string>(initial?.takeProfit1?.toString() ?? "");
  const [tp2, setTp2] = useState<string>(initial?.takeProfit2?.toString() ?? "");

  const [quality, setQuality] = useState<"HIGH" | "MEDIUM" | "LOW">(
    (initial?.qualityRating as "HIGH" | "MEDIUM" | "LOW") ?? "MEDIUM",
  );
  const [bias, setBias] = useState<"BULLISH" | "BEARISH" | "NEUTRAL">(
    (initial?.biasHTF as "BULLISH" | "BEARISH" | "NEUTRAL") ?? "NEUTRAL",
  );
  const [positionSize, setPositionSize] = useState<string>(
    initial?.positionSize?.toString() ?? "0",
  );
  const [riskUSD, setRiskUSD] = useState<string>(
    initial?.riskUSD?.toString() ?? "0",
  );

  const [preNotes, setPreNotes] = useState<string>(initial?.preTradeNotes ?? "");
  const [screenshotUrl, setScreenshotUrl] = useState<string>(
    initial?.screenshotUrl ?? "",
  );

  const [closed, setClosed] = useState<boolean>(!!initial?.exitTime);
  const [exitPrice, setExitPrice] = useState<string>(
    initial?.exitPrice?.toString() ?? "",
  );
  const [exitTime, setExitTime] = useState<string>(
    initial?.exitTime
      ? new Date(initial.exitTime).toISOString().slice(0, 16)
      : "",
  );
  const [tp1Hit, setTp1Hit] = useState(initial?.tp1Hit ?? false);
  const [tp2Hit, setTp2Hit] = useState(initial?.tp2Hit ?? false);
  const [beHit, setBeHit] = useState(initial?.beHit ?? false);
  const [rAchieved, setRAchieved] = useState<string>(
    initial?.rAchieved?.toString() ?? "",
  );
  const [pnlUSD, setPnlUSD] = useState<string>(initial?.pnlUSD?.toString() ?? "");
  const [postNotes, setPostNotes] = useState<string>(
    initial?.postTradeNotes ?? "",
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Derived
  const slPips = useMemo(() => {
    const e = Number(entryPrice);
    const s = Number(stopLoss);
    if (!Number.isFinite(e) || !Number.isFinite(s)) return null;
    return pipsBetween(pair, e, s);
  }, [entryPrice, stopLoss, pair]);

  const rrTp1 = useMemo(() => {
    return calcRR(direction, Number(entryPrice), Number(stopLoss), Number(tp1) || null);
  }, [direction, entryPrice, stopLoss, tp1]);

  const rrTp2 = useMemo(() => {
    return calcRR(direction, Number(entryPrice), Number(stopLoss), Number(tp2) || null);
  }, [direction, entryPrice, stopLoss, tp2]);

  // Auto-update killzone when entryTime changes
  useEffect(() => {
    if (killzoneTouched) return;
    if (!entryTime) return;
    setKillzone(deriveKillzoneFromDate(new Date(entryTime)));
  }, [entryTime, killzoneTouched]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!pair || !direction) {
      setError("Par y dirección requeridos.");
      return;
    }
    if (!entryPrice || !stopLoss) {
      setError("Entrada y stop loss requeridos.");
      return;
    }
    if (confluences.length === 0) {
      setError("Selecciona al menos una confluencia.");
      return;
    }

    const payload = {
      pair,
      direction,
      qualityRating: quality,
      biasHTF: bias,
      killzone,
      entryPrice: Number(entryPrice),
      stopLoss: Number(stopLoss),
      takeProfit1: tp1 ? Number(tp1) : null,
      takeProfit2: tp2 ? Number(tp2) : null,
      positionSize: Number(positionSize) || 0,
      riskPercent: QUALITY_RISK[quality],
      riskUSD: Number(riskUSD) || 0,
      entryTime: new Date(entryTime).toISOString(),
      preTradeNotes: preNotes || null,
      screenshotUrl: screenshotUrl || null,
      confluences,
      // closed
      ...(closed
        ? {
            exitPrice: exitPrice ? Number(exitPrice) : null,
            exitTime: exitTime ? new Date(exitTime).toISOString() : null,
            tp1Hit,
            tp2Hit,
            beHit,
            rAchieved: rAchieved ? Number(rAchieved) : null,
            pnlUSD: pnlUSD ? Number(pnlUSD) : null,
            postTradeNotes: postNotes || null,
          }
        : {}),
    };

    setPending(true);
    try {
      const url = mode === "create" ? "/api/trades" : `/api/trades/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Error al guardar");
      }
      const data = await res.json();
      playSound("success");
      const id = data.trade?.id ?? initial?.id;
      router.push(`/trades/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const inputCls =
    "w-full bg-onyx text-cream text-sm rounded-md px-3 py-2 outline-none";
  const inputStyle = { border: "0.5px solid var(--color-graphite)" } as const;
  const labelCls = "block text-mute mb-1.5 uppercase";
  const labelStyle = { fontSize: "10px", letterSpacing: "0.18em" } as const;

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-8">
      {/* SECCIÓN 1: BÁSICA */}
      <Section title="Información básica">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>Par</label>
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className={inputCls}
              style={inputStyle}
            >
              {PAIRS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Dirección</label>
            <div className="flex gap-2">
              {(["LONG", "SHORT"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className="flex-1 py-2 rounded-md text-xs uppercase font-medium transition-colors"
                  style={{
                    background:
                      direction === d
                        ? "var(--color-rose)"
                        : "var(--color-coal)",
                    color:
                      direction === d
                        ? "var(--color-onyx)"
                        : "var(--color-cream-muted)",
                    border: "0.5px solid var(--color-graphite)",
                    letterSpacing: "0.18em",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className={labelCls} style={labelStyle}>Hora entrada</label>
            <input
              type="datetime-local"
              value={entryTime}
              onChange={(e) => setEntryTime(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Killzone</label>
            <select
              value={killzone}
              onChange={(e) => {
                setKillzone(e.target.value);
                setKillzoneTouched(true);
              }}
              className={inputCls}
              style={inputStyle}
            >
              {KILLZONES.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* SECCIÓN 2: CONFLUENCIAS */}
      <Section title="Setup y confluencias">
        <p className="text-xs text-dust mb-3">
          Selecciona todos los conceptos que aplicaron a este trade. Más confluencias = mayor calidad.
        </p>
        {confluences.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {confluences.map((k) => (
              <ConfluencePill
                key={k}
                conceptKey={k}
                onRemove={() =>
                  setConfluences(confluences.filter((x) => x !== k))
                }
              />
            ))}
          </div>
        )}
        <ConfluenceSelector value={confluences} onChange={setConfluences} />
      </Section>

      {/* SECCIÓN 3: NIVELES */}
      <Section title="Niveles">
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Entrada" value={entryPrice} setValue={setEntryPrice} />
          <NumField label="Stop Loss" value={stopLoss} setValue={setStopLoss} />
          <NumField label="Take Profit 1" value={tp1} setValue={setTp1} />
          <NumField label="Take Profit 2" value={tp2} setValue={setTp2} />
        </div>
        <div className="mt-3 flex gap-6 text-xs text-dust font-mono">
          <span>SL: {slPips != null ? `${slPips.toFixed(1)} pips` : "—"}</span>
          <span>R:R TP1: {rrTp1 != null ? rrTp1.toFixed(2) : "—"}</span>
          <span>R:R TP2: {rrTp2 != null ? rrTp2.toFixed(2) : "—"}</span>
        </div>
      </Section>

      {/* SECCIÓN 4: RIESGO */}
      <Section title="Riesgo">
        <div>
          <label className={labelCls} style={labelStyle}>Calidad del setup</label>
          <div className="flex gap-2">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(q)}
                className="flex-1 py-2 rounded-md text-xs uppercase transition-colors"
                style={{
                  background:
                    quality === q ? "var(--color-rose)" : "var(--color-coal)",
                  color:
                    quality === q
                      ? "var(--color-onyx)"
                      : "var(--color-cream-muted)",
                  border: "0.5px solid var(--color-graphite)",
                  letterSpacing: "0.14em",
                }}
              >
                {q} · {QUALITY_RISK[q]}%
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls} style={labelStyle}>Bias HTF</label>
          <div className="flex gap-2">
            {(["BULLISH", "BEARISH", "NEUTRAL"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBias(b)}
                className="flex-1 py-2 rounded-md text-xs uppercase transition-colors"
                style={{
                  background:
                    bias === b ? "var(--color-violet)" : "var(--color-coal)",
                  color:
                    bias === b ? "var(--color-onyx)" : "var(--color-cream-muted)",
                  border: "0.5px solid var(--color-graphite)",
                  letterSpacing: "0.14em",
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <NumField label="Tamaño (lotes)" value={positionSize} setValue={setPositionSize} />
          <NumField label="Riesgo USD" value={riskUSD} setValue={setRiskUSD} />
        </div>
      </Section>

      {/* SECCIÓN 5: NOTAS */}
      <Section title="Notas">
        <div>
          <label className={labelCls} style={labelStyle}>
            ¿Por qué tomaste este trade?
          </label>
          <textarea
            value={preNotes}
            onChange={(e) => setPreNotes(e.target.value)}
            rows={3}
            className={`${inputCls} font-mono`}
            style={inputStyle}
          />
        </div>
        <div className="mt-3">
          <label className={labelCls} style={labelStyle}>Screenshot URL</label>
          <input
            type="url"
            value={screenshotUrl}
            onChange={(e) => setScreenshotUrl(e.target.value)}
            placeholder="https://www.tradingview.com/x/..."
            className={inputCls}
            style={inputStyle}
          />
        </div>
      </Section>

      {/* SECCIÓN 6: RESULTADO */}
      <Section title="Resultado">
        <label className="flex items-center gap-2 text-sm text-cream-muted">
          <input
            type="checkbox"
            checked={closed}
            onChange={(e) => setClosed(e.target.checked)}
            style={{ accentColor: "var(--color-rose)" }}
          />
          Trade ya cerrado
        </label>
        {closed && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Precio salida" value={exitPrice} setValue={setExitPrice} />
              <div>
                <label className={labelCls} style={labelStyle}>Hora salida</label>
                <input
                  type="datetime-local"
                  value={exitTime}
                  onChange={(e) => setExitTime(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-cream-muted">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={tp1Hit} onChange={(e) => setTp1Hit(e.target.checked)} style={{ accentColor: "var(--color-rose)" }} />
                TP1
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={tp2Hit} onChange={(e) => setTp2Hit(e.target.checked)} style={{ accentColor: "var(--color-rose)" }} />
                TP2
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={beHit} onChange={(e) => setBeHit(e.target.checked)} style={{ accentColor: "var(--color-rose)" }} />
                BE
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="R obtenido" value={rAchieved} setValue={setRAchieved} />
              <NumField label="P&L USD" value={pnlUSD} setValue={setPnlUSD} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>
                ¿Qué aprendiste?
              </label>
              <textarea
                value={postNotes}
                onChange={(e) => setPostNotes(e.target.value)}
                rows={3}
                className={`${inputCls} font-mono`}
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </Section>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-rose-deep)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-4">
        <Link
          href={initial ? `/trades/${initial.id}` : "/trades"}
          className="text-sm text-mute hover:text-cream px-3 py-2"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-5 py-2.5 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "var(--color-rose)",
            color: "var(--color-onyx)",
            letterSpacing: "0.18em",
          }}
        >
          {pending
            ? "Guardando…"
            : mode === "create"
            ? "Guardar trade"
            : "Actualizar trade"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pb-6" style={{ borderBottom: "0.5px solid var(--color-graphite)" }}>
      <h2
        className="text-mute uppercase mb-4"
        style={{ fontSize: "10px", letterSpacing: "0.22em", fontWeight: 500 }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function NumField({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div>
      <label
        className="block text-mute mb-1.5 uppercase"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        {label}
      </label>
      <input
        type="number"
        step="0.00001"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full bg-onyx text-cream text-sm rounded-md px-3 py-2 outline-none font-mono tabular-nums"
        style={{ border: "0.5px solid var(--color-graphite)" }}
      />
    </div>
  );
}
