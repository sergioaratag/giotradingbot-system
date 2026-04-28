"use client";

import { useEffect, useState } from "react";

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const v = window.localStorage.getItem(key);
  if (v === null) return defaultValue;
  return v === "true";
}

function writeBool(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

export function SettingsForm() {
  const [sounds, setSounds] = useState(true);
  const [focusDefault, setFocusDefault] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSounds(readBool("sounds_enabled", true));
    setFocusDefault(readBool("focus_default", false));
    setMounted(true);
  }, []);

  function update(key: string, setter: (v: boolean) => void, value: boolean) {
    setter(value);
    writeBool(key, value);
  }

  return (
    <div className="space-y-10">
      <Section title="Apariencia">
        <Toggle
          label="Sonidos sutiles"
          description="Tonos discretos al navegar y completar acciones."
          enabled={sounds}
          onChange={(v) => update("sounds_enabled", setSounds, v)}
          disabled={!mounted}
        />
        <Toggle
          label="Modo concentración por defecto"
          description="Atenúa elementos secundarios al iniciar (Cmd+. para alternar)."
          enabled={focusDefault}
          onChange={(v) => update("focus_default", setFocusDefault, v)}
          disabled={!mounted}
        />
      </Section>

      <Section title="Cuenta">
        <button
          className="text-sm text-cream-muted hover:text-rose transition-colors"
          onClick={() => alert("Próximamente.")}
        >
          Cambiar contraseña
        </button>
      </Section>

      <Section title="Bot">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-mute)" }}
          />
          <span
            className="font-mono text-xs text-dust"
            style={{ letterSpacing: "0.14em" }}
          >
            BOT OFF — sin VPS configurado
          </span>
        </div>
      </Section>
    </div>
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
    <section
      className="pb-8"
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
            background: enabled ? "var(--color-onyx)" : "var(--color-cream-muted)",
            left: enabled ? "16px" : "2px",
          }}
        />
      </button>
    </div>
  );
}
