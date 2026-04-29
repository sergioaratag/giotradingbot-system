"use client";

import { useEffect, useRef, useState } from "react";
import { AlertOctagon, X } from "lucide-react";
import { playSound } from "@/lib/sounds";

const CONFIRM = "KILL";

export function KillSwitchModal({
  onClose,
  onConfirmed,
}: {
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    playSound("open");
  }, []);

  async function activate() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/bot/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activated: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Error");
      }
      playSound("success");
      onConfirmed();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  function close() {
    playSound("close");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(5,5,7,0.82)",
        backdropFilter: "blur(6px)",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-coal rounded-lg gio-spring"
        style={{ border: "0.5px solid var(--color-shadow)" }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
        >
          <div className="flex items-center gap-2">
            <AlertOctagon
              className="h-5 w-5"
              strokeWidth={1.8}
              style={{ color: "var(--color-rose)" }}
            />
            <h2
              className="text-cream"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontSize: "1.1rem",
              }}
            >
              Activar kill switch
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-mute hover:text-cream"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-cream-muted">
            El bot cerrará todas las posiciones abiertas y dejará de operar
            hasta que desactives el kill switch manualmente.
          </p>
          <p className="text-xs text-dust">
            Para confirmar, escribe{" "}
            <span
              className="font-mono"
              style={{ color: "var(--color-rose)" }}
            >
              KILL
            </span>{" "}
            abajo.
          </p>
          <input
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-onyx text-cream text-sm font-mono rounded-md px-3 py-2 outline-none tracking-widest"
            style={{ border: "0.5px solid var(--color-graphite)" }}
          />
          {error && (
            <p
              className="text-sm"
              style={{ color: "var(--color-rose-deep)" }}
            >
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 p-4"
          style={{ borderTop: "0.5px solid var(--color-graphite)" }}
        >
          <button
            type="button"
            onClick={close}
            className="text-sm text-mute hover:text-cream px-3 py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={activate}
            disabled={text !== CONFIRM || pending}
            className="rounded-md px-4 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "var(--color-rose-deep)",
              color: "var(--color-cream)",
              letterSpacing: "0.18em",
            }}
          >
            {pending ? "Activando…" : "Activar kill switch"}
          </button>
        </div>
      </div>
    </div>
  );
}
