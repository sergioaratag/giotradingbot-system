"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { playSound } from "@/lib/sounds";

const CONFIRM = "RESET ALL MY DATA";

export function ResetDataModal({
  onClose,
  onResetDone,
}: {
  onClose: () => void;
  onResetDone: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    playSound("open");
  }, []);

  async function reset() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/reset-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error");
      playSound("close");
      onResetDone();
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
            <Trash2
              className="h-4 w-4"
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
              Resetear datos
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
            Se eliminarán <strong className="text-cream">todos</strong> tus
            trades (con sus confluencias), notas, tareas y entradas del vault.
          </p>
          <p className="text-xs text-dust">
            Tu cuenta, configuración del bot y noticias económicas se conservan.
            Esta acción es irreversible.
          </p>
          <p className="text-xs text-dust">
            Escribe{" "}
            <span
              className="font-mono"
              style={{ color: "var(--color-rose)" }}
            >
              {CONFIRM}
            </span>{" "}
            para confirmar.
          </p>
          <input
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-onyx text-cream text-sm font-mono rounded-md px-3 py-2 outline-none"
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
            onClick={reset}
            disabled={text !== CONFIRM || pending}
            className="rounded-md px-4 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "var(--color-rose-deep)",
              color: "var(--color-cream)",
              letterSpacing: "0.18em",
            }}
          >
            {pending ? "Eliminando…" : "Resetear todo"}
          </button>
        </div>
      </div>
    </div>
  );
}
