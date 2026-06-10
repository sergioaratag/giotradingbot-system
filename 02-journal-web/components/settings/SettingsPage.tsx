"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  Check,
  ChevronDown,
  Copy,
  Download,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  BOT_CONFIG_GROUPS,
  BOT_CONFIG_SPECS,
  type BotConfigGroup,
  type BotConfigSpec,
  isValidValue,
} from "@/lib/bot-config";
import { useBotStatus } from "@/hooks/useBotStatus";
import { playSound } from "@/lib/sounds";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { KillSwitchModal } from "./KillSwitchModal";
import { ResetDataModal } from "./ResetDataModal";

type ConfigRow = { key: string; value: string };
type Profile = {
  email: string;
  name: string | null;
};

type Stats = {
  counts: { trades: number; notes: number; tasks: number; vault: number };
  botApiKey: { last4: string; present: boolean };
  version: string;
  dbRegion: string;
};

const SOUNDS_KEY = "sounds_enabled";
const FOCUS_KEY = "focus_default";

export function SettingsPage({ isOwner }: { isOwner: boolean }) {
  // ──── Profile
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  // ──── Stats
  const [stats, setStats] = useState<Stats | null>(null);

  // ──── Bot configs
  const [configs, setConfigs] = useState<Map<string, string>>(new Map());
  const [draftConfigs, setDraftConfigs] = useState<Map<string, string>>(
    new Map(),
  );
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  // ──── Bot status / kill-switch
  const bot = useBotStatus();
  const [showKillModal, setShowKillModal] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);

  // ──── Modales
  const [showPwd, setShowPwd] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // ──── Apariencia (localStorage)
  const [sounds, setSounds] = useState(true);
  const [focusDefault, setFocusDefault] = useState(false);
  const [appearanceMounted, setAppearanceMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSounds(window.localStorage.getItem(SOUNDS_KEY) !== "false");
    setFocusDefault(window.localStorage.getItem(FOCUS_KEY) === "true");
    setAppearanceMounted(true);
  }, []);

  // ──── Initial loads
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [pRes, sRes, cRes] = await Promise.all([
        fetch("/api/account/profile"),
        fetch("/api/account/stats"),
        fetch("/api/bot-config"),
      ]);
      if (!alive) return;
      if (pRes.ok) {
        const data = await pRes.json();
        setProfile(data.user);
        setNameDraft(data.user?.name ?? "");
      }
      if (sRes.ok) {
        setStats(await sRes.json());
      }
      if (cRes.ok) {
        const data = await cRes.json();
        const map = new Map<string, string>();
        for (const c of data.configs ?? []) map.set(c.key, c.value);
        setConfigs(map);
        setDraftConfigs(new Map(map));
        setConfigsLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function setLocal<T>(key: string, value: T) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, String(value));
  }

  function updateAppearance(
    key: string,
    setter: (v: boolean) => void,
    value: boolean,
  ) {
    setter(value);
    setLocal(key, value);
  }

  async function saveProfile() {
    if (nameDraft === (profile?.name ?? "")) return;
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfile(data.user);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
  }

  async function toggleBot() {
    if (!isOwner) return; // Fase 2.6 — solo OWNER. El server además responde 403.
    setTogglingBot(true);
    try {
      const res = await fetch("/api/bot/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !bot.enabled }),
      });
      if (res.ok) {
        playSound("success");
        await bot.refresh();
        // Sync con configs map para que la sección Switches refleje el cambio
        setConfigs((prev) => {
          const next = new Map(prev);
          next.set("BotEnabled", String(!bot.enabled));
          return next;
        });
        setDraftConfigs((prev) => {
          const next = new Map(prev);
          next.set("BotEnabled", String(!bot.enabled));
          return next;
        });
      }
    } finally {
      setTogglingBot(false);
    }
  }

  async function disableKillSwitch() {
    if (!isOwner) return;
    const res = await fetch("/api/bot/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activated: false }),
    });
    if (res.ok) {
      playSound("success");
      await bot.refresh();
    }
  }

  function setConfig(key: string, value: string) {
    if (!isOwner) return;
    setDraftConfigs((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  }

  function resetConfigsToDefault() {
    if (!isOwner) return;
    const next = new Map<string, string>();
    for (const spec of BOT_CONFIG_SPECS) next.set(spec.key, spec.default);
    setDraftConfigs(next);
  }

  const configChanges = useMemo(() => {
    const out: ConfigRow[] = [];
    for (const [k, v] of draftConfigs) {
      if (configs.get(k) !== v) out.push({ key: k, value: v });
    }
    return out;
  }, [configs, draftConfigs]);

  async function saveConfigs() {
    if (!isOwner) return;
    if (!configChanges.length) return;
    setSavingConfigs(true);
    setConfigMsg(null);
    try {
      const res = await fetch("/api/bot-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: configChanges }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Error al guardar");
      }
      playSound("success");
      setConfigs(new Map(draftConfigs));
      setConfigMsg(`Guardado · ${data.updated} parámetros`);
      setTimeout(() => setConfigMsg(null), 2500);
    } catch (err) {
      setConfigMsg((err as Error).message);
    } finally {
      setSavingConfigs(false);
    }
  }

  const exportTrades = useCallback(() => {
    window.location.href = "/api/trades/export";
  }, []);

  async function copyApiKey() {
    const res = await fetch("/api/account/bot-api-key");
    if (!res.ok) return;
    const data = await res.json();
    if (typeof window !== "undefined" && data.key && navigator.clipboard) {
      await navigator.clipboard.writeText(data.key);
      playSound("success");
    }
  }

  function copyBotEndpoint() {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(`${window.location.origin}/api/bot/trade`);
    playSound("success");
  }

  const inputCls =
    "w-full bg-onyx text-cream text-sm rounded-md px-3 py-2 outline-none";
  const inputStyle = { border: "0.5px solid var(--color-graphite)" } as const;

  return (
    <div className="max-w-3xl space-y-12 pb-24">
      <header>
        <h1
          className="text-cream"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: "2rem",
            letterSpacing: "-0.01em",
          }}
        >
          Settings
        </h1>
        <p className="text-dust mt-1 text-sm">Configuración del sistema</p>
      </header>

      {/* ───── Cuenta ───── */}
      <Section title="Cuenta">
        <Field label="Email">
          <input
            type="email"
            value={profile?.email ?? ""}
            readOnly
            className={`${inputCls} text-dust cursor-not-allowed`}
            style={inputStyle}
          />
        </Field>
        <Field label="Nombre">
          <div className="flex gap-2">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveProfile}
              className={inputCls}
              style={inputStyle}
              placeholder="Tu nombre"
            />
            {profileSaved && (
              <span
                className="inline-flex items-center text-xs text-rose"
                style={{ letterSpacing: "0.10em" }}
              >
                Guardado
              </span>
            )}
          </div>
        </Field>
        <button
          type="button"
          onClick={() => setShowPwd(true)}
          className="text-sm text-cream-muted hover:text-rose transition-colors"
        >
          Cambiar contraseña →
        </button>
      </Section>

      {/* ───── Apariencia ───── */}
      <Section title="Apariencia">
        <Toggle
          label="Sonidos sutiles"
          description="Tonos discretos al navegar y completar acciones."
          enabled={sounds}
          onChange={(v) => updateAppearance(SOUNDS_KEY, setSounds, v)}
          disabled={!appearanceMounted}
        />
        <Toggle
          label="Modo concentración por defecto"
          description="Atenúa elementos secundarios al iniciar (Cmd+. para alternar)."
          enabled={focusDefault}
          onChange={(v) =>
            updateAppearance(FOCUS_KEY, setFocusDefault, v)
          }
          disabled={!appearanceMounted}
        />
      </Section>

      {/* ───── Lock para no-OWNER (Fase 2.6) ───── */}
      {!isOwner && (
        <div
          className="flex items-start gap-3 px-4 py-3 mb-2"
          style={{
            background: "rgba(107, 107, 112, 0.14)",
            border: "0.5px solid var(--color-graphite)",
          }}
        >
          <AlertOctagon
            className="h-4 w-4 mt-0.5 shrink-0"
            strokeWidth={1.8}
            style={{ color: "var(--color-mute)" }}
          />
          <p className="text-xs text-cream-muted leading-relaxed">
            🔒 Solo el <strong>owner</strong> del bot puede modificar su
            configuración. Podés ver todo, pero los controles están
            deshabilitados. Contactá a Sergio.
          </p>
        </div>
      )}

      {/* ───── Bot — Estado / Kill switch ───── */}
      <Section title="Bot · Estado" anchor="bot">
        <div
          className="bg-coal p-5 flex flex-col gap-4"
          style={{ border: "0.5px solid var(--color-graphite)" }}
        >
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div
                className="text-[10px] text-mute uppercase"
                style={{ letterSpacing: "0.22em" }}
              >
                Estado del bot
              </div>
              <div
                className="font-mono mt-1"
                style={{
                  fontSize: "2rem",
                  letterSpacing: "0.08em",
                  color: bot.enabled
                    ? "var(--color-rose)"
                    : "var(--color-mute)",
                }}
              >
                {bot.enabled ? "ON" : "OFF"}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleBot}
              disabled={togglingBot || bot.killSwitch || !isOwner}
              className="relative shrink-0 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: "52px",
                height: "26px",
                background: bot.enabled
                  ? "var(--color-rose)"
                  : "var(--color-graphite)",
              }}
              aria-pressed={bot.enabled}
            >
              <span
                aria-hidden
                className="absolute top-1 rounded-full transition-all"
                style={{
                  width: "18px",
                  height: "18px",
                  background: bot.enabled
                    ? "var(--color-onyx)"
                    : "var(--color-cream-muted)",
                  left: bot.enabled ? "30px" : "4px",
                }}
              />
            </button>
          </div>

          {bot.killSwitch ? (
            <div
              className="flex items-center justify-between gap-3 px-3 py-2.5"
              style={{
                background: "rgba(107, 107, 112, 0.18)",
                border: "0.5px solid rgba(107, 107, 112, 0.40)",
              }}
            >
              <div className="flex items-center gap-2">
                <AlertOctagon
                  className="h-4 w-4"
                  strokeWidth={1.8}
                  style={{ color: "var(--color-loss)" }}
                />
                <span
                  className="text-xs uppercase font-medium"
                  style={{
                    color: "var(--color-loss)",
                    letterSpacing: "0.18em",
                  }}
                >
                  Kill switch activo
                </span>
              </div>
              <button
                type="button"
                onClick={disableKillSwitch}
                disabled={!isOwner}
                className="text-xs uppercase text-cream-muted hover:text-cream disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ letterSpacing: "0.14em" }}
              >
                Desactivar
              </button>
            </div>
          ) : bot.enabled ? (
            <button
              type="button"
              onClick={() => setShowKillModal(true)}
              disabled={!isOwner}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              style={{
                background: "var(--color-rose-deep)",
                color: "var(--color-cream)",
                letterSpacing: "0.22em",
              }}
            >
              <AlertOctagon className="h-4 w-4" strokeWidth={1.8} />
              Kill switch
            </button>
          ) : (
            <p className="text-xs text-dust">
              Activa el bot para habilitar el kill switch.
            </p>
          )}
        </div>
      </Section>

      {/* ───── Bot — Parámetros ───── */}
      <Section title="Bot · Parámetros">
        {!configsLoaded ? (
          <p className="text-xs text-mute">Cargando parámetros…</p>
        ) : (
          <>
            <div className="space-y-3">
              {BOT_CONFIG_GROUPS.map((g) => (
                <ConfigGroup
                  key={g.key}
                  groupKey={g.key}
                  label={g.label}
                  values={draftConfigs}
                  originalValues={configs}
                  onChange={setConfig}
                />
              ))}
            </div>

            <div
              className="sticky bottom-0 -mx-1 mt-6 flex items-center justify-between gap-3 px-3 py-3 bg-coal flex-wrap"
              style={{ border: "0.5px solid var(--color-graphite)" }}
            >
              <button
                type="button"
                onClick={resetConfigsToDefault}
                disabled={!isOwner}
                className="inline-flex items-center gap-1.5 text-xs uppercase text-cream-muted hover:text-rose transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ letterSpacing: "0.14em" }}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />
                Restaurar valores por defecto
              </button>
              <div className="flex items-center gap-3">
                {configMsg && (
                  <span className="text-xs text-mute">{configMsg}</span>
                )}
                <button
                  type="button"
                  onClick={saveConfigs}
                  disabled={!configChanges.length || savingConfigs || !isOwner}
                  className="rounded-md px-4 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: "var(--color-rose)",
                    color: "var(--color-onyx)",
                    letterSpacing: "0.18em",
                  }}
                >
                  {savingConfigs
                    ? "Guardando…"
                    : configChanges.length
                      ? `Guardar ${configChanges.length} cambio${
                          configChanges.length === 1 ? "" : "s"
                        }`
                      : "Sin cambios"}
                </button>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* ───── Datos ───── */}
      <Section title="Datos">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportTrades}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs uppercase transition-colors hover:bg-graphite/40"
            style={{
              background: "var(--color-coal)",
              border: "0.5px solid var(--color-graphite)",
              color: "var(--color-cream)",
              letterSpacing: "0.14em",
            }}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
            Exportar trades a CSV
          </button>
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs uppercase transition-colors"
            style={{
              background: "transparent",
              border: "0.5px solid var(--color-rose-deep)",
              color: "var(--color-rose)",
              letterSpacing: "0.14em",
            }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Resetear datos (peligroso)
          </button>
        </div>
      </Section>

      {/* ───── Info del sistema ───── */}
      <Section title="Sistema">
        <SystemInfo
          stats={stats}
          onCopyEndpoint={copyBotEndpoint}
          onCopyApiKey={copyApiKey}
        />
      </Section>

      {showPwd && <ChangePasswordModal onClose={() => setShowPwd(false)} />}
      {showKillModal && (
        <KillSwitchModal
          onClose={() => setShowKillModal(false)}
          onConfirmed={async () => {
            setShowKillModal(false);
            await bot.refresh();
          }}
        />
      )}
      {showReset && (
        <ResetDataModal
          onClose={() => setShowReset(false)}
          onResetDone={() => {
            setShowReset(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  anchor,
  children,
}: {
  title: string;
  anchor?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={anchor}
      className="pb-10"
      style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
    >
      <h2
        className="text-mute uppercase mb-5"
        style={{ fontSize: "10px", letterSpacing: "0.22em", fontWeight: 500 }}
      >
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-mute mb-1.5 uppercase"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  enabled,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm text-cream">{label}</div>
        <div className="text-xs text-dust mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!enabled)}
        aria-pressed={enabled}
        className="relative shrink-0 rounded-full transition-colors"
        style={{
          width: "32px",
          height: "18px",
          background: enabled ? "var(--color-rose)" : "var(--color-graphite)",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span
          aria-hidden
          className="absolute top-0.5 rounded-full transition-all"
          style={{
            width: "14px",
            height: "14px",
            background: enabled
              ? "var(--color-onyx)"
              : "var(--color-cream-muted)",
            left: enabled ? "16px" : "2px",
          }}
        />
      </button>
    </div>
  );
}

function ConfigGroup({
  groupKey,
  label,
  values,
  originalValues,
  onChange,
}: {
  groupKey: BotConfigGroup;
  label: string;
  values: Map<string, string>;
  originalValues: Map<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const specs = BOT_CONFIG_SPECS.filter((s) => s.group === groupKey);
  const dirty = specs.some(
    (s) => originalValues.get(s.key) !== values.get(s.key),
  );

  return (
    <div
      className="bg-coal"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2">
          <span
            className="text-cream uppercase"
            style={{ fontSize: "11px", letterSpacing: "0.22em" }}
          >
            {label}
          </span>
          {dirty && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-rose)" }}
              aria-label="cambios pendientes"
            />
          )}
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          strokeWidth={1.5}
          style={{
            color: "var(--color-mute)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open && (
        <div
          className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4"
          style={{ borderTop: "0.5px solid var(--color-graphite)" }}
        >
          {specs.map((s) => (
            <ConfigField
              key={s.key}
              spec={s}
              value={values.get(s.key) ?? s.default}
              onChange={(v) => onChange(s.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigField({
  spec,
  value,
  onChange,
}: {
  spec: BotConfigSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = isValidValue(spec, value);
  const isBool = spec.type === "boolean";

  return (
    <div className="pt-3">
      <label
        className="block text-mute mb-1 uppercase"
        style={{ fontSize: "10px", letterSpacing: "0.16em" }}
      >
        {spec.label}
        {spec.unit && (
          <span className="text-dust ml-1 normal-case">({spec.unit})</span>
        )}
      </label>
      {isBool ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-onyx text-cream text-sm rounded-md px-3 py-2 outline-none"
          style={{ border: "0.5px solid var(--color-graphite)" }}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      ) : (
        <input
          type={spec.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={spec.step}
          min={spec.min}
          max={spec.max}
          className="w-full bg-onyx text-cream text-sm font-mono rounded-md px-3 py-2 outline-none"
          style={{
            border: `0.5px solid ${
              valid ? "var(--color-graphite)" : "var(--color-rose-deep)"
            }`,
          }}
        />
      )}
      <p className="text-[11px] text-dust mt-1 leading-snug">
        {spec.description}
      </p>
      {!valid && (
        <p
          className="text-[10px] uppercase mt-0.5"
          style={{
            color: "var(--color-rose-deep)",
            letterSpacing: "0.14em",
          }}
        >
          Fuera de rango {spec.min}–{spec.max}
        </p>
      )}
    </div>
  );
}

function SystemInfo({
  stats,
  onCopyEndpoint,
  onCopyApiKey,
}: {
  stats: Stats | null;
  onCopyEndpoint: () => void;
  onCopyApiKey: () => void | Promise<void>;
}) {
  const [copied, setCopied] = useState<"endpoint" | "key" | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  function clickEndpoint() {
    onCopyEndpoint();
    setCopied("endpoint");
    setTimeout(() => setCopied(null), 1500);
  }
  async function clickApiKey() {
    await onCopyApiKey();
    setCopied("key");
    setTimeout(() => setCopied(null), 1500);
  }

  if (!stats) {
    return <p className="text-xs text-mute">Cargando…</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <InfoRow label="Versión" value={stats.version} />
      <InfoRow label="DB Region" value={stats.dbRegion} />
      <InfoRow label="Trades" value={stats.counts.trades.toString()} />
      <InfoRow label="Notas" value={stats.counts.notes.toString()} />
      <InfoRow label="Tareas" value={stats.counts.tasks.toString()} />
      <InfoRow label="Vault" value={stats.counts.vault.toString()} />
      <div className="sm:col-span-2">
        <InfoRow
          label="Bot endpoint"
          value={`${origin}/api/bot/trade`}
          mono
          action={
            <button
              type="button"
              onClick={clickEndpoint}
              className="inline-flex items-center gap-1 text-[10px] uppercase text-cream-muted hover:text-rose"
              style={{ letterSpacing: "0.14em" }}
            >
              {copied === "endpoint" ? (
                <Check className="h-3 w-3" strokeWidth={2} />
              ) : (
                <Copy className="h-3 w-3" strokeWidth={1.8} />
              )}
              {copied === "endpoint" ? "Copiado" : "Copiar"}
            </button>
          }
        />
      </div>
      <div className="sm:col-span-2">
        <InfoRow
          label="BOT_API_KEY"
          value={
            stats.botApiKey.present
              ? `••••••••••••${stats.botApiKey.last4}`
              : "(no configurado)"
          }
          mono
          action={
            stats.botApiKey.present ? (
              <button
                type="button"
                onClick={clickApiKey}
                className="inline-flex items-center gap-1 text-[10px] uppercase text-cream-muted hover:text-rose"
                style={{ letterSpacing: "0.14em" }}
              >
                {copied === "key" ? (
                  <Check className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <Copy className="h-3 w-3" strokeWidth={1.8} />
                )}
                {copied === "key" ? "Copiado" : "Copiar full key"}
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="bg-coal px-3 py-2.5"
      style={{ border: "0.5px solid var(--color-graphite)" }}
    >
      <div
        className="text-[10px] text-mute uppercase"
        style={{ letterSpacing: "0.18em" }}
      >
        {label}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span
          className={`text-cream truncate ${mono ? "font-mono text-xs" : "text-sm"}`}
        >
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}
