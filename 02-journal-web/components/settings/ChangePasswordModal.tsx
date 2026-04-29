"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { checkPassword } from "@/lib/password";
import { playSound } from "@/lib/sounds";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    playSound("open");
  }, []);

  const check = checkPassword(next);
  const matches = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && check.ok && matches && !pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setPending(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error al cambiar la contraseña");
      playSound("success");
      // Forzar logout para reautenticación con la nueva password.
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  function close() {
    playSound("close");
    onClose();
  }

  const inputCls =
    "w-full bg-onyx text-cream text-sm rounded-md px-3 py-2 outline-none";
  const inputStyle = { border: "0.5px solid var(--color-graphite)" } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(5,5,7,0.78)",
        backdropFilter: "blur(6px)",
      }}
      onClick={close}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-coal rounded-lg gio-spring"
        style={{ border: "0.5px solid var(--color-shadow)" }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
        >
          <h2
            className="text-cream"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "1.1rem",
            }}
          >
            Cambiar contraseña
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-mute hover:text-cream"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <Label>Contraseña actual</Label>
            <input
              ref={ref}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputCls}
              style={inputStyle}
              autoComplete="current-password"
            />
          </div>

          <div>
            <Label>Nueva contraseña</Label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputCls}
              style={inputStyle}
              autoComplete="new-password"
            />
            <ul className="mt-2 grid grid-cols-2 gap-1 text-[10px] uppercase tracking-wider">
              <Req ok={check.length}>12+ caracteres</Req>
              <Req ok={check.upper}>1 mayúscula</Req>
              <Req ok={check.digit}>1 número</Req>
              <Req ok={check.symbol}>1 símbolo</Req>
            </ul>
          </div>

          <div>
            <Label>Confirmar nueva contraseña</Label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
              style={inputStyle}
              autoComplete="new-password"
            />
            {confirm.length > 0 && !matches && (
              <p
                className="mt-1 text-[10px] uppercase"
                style={{
                  color: "var(--color-rose-deep)",
                  letterSpacing: "0.14em",
                }}
              >
                No coincide
              </p>
            )}
          </div>

          {error && (
            <p
              className="text-sm"
              style={{ color: "var(--color-rose-deep)" }}
            >
              {error}
            </p>
          )}

          <p className="text-[11px] text-dust">
            Al cambiar la contraseña se cerrará tu sesión y deberás iniciar
            sesión de nuevo.
          </p>
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
            type="submit"
            disabled={!canSubmit}
            className="rounded-md px-4 py-2 text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "var(--color-rose)",
              color: "var(--color-onyx)",
              letterSpacing: "0.18em",
            }}
          >
            {pending ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-mute mb-1.5 uppercase"
      style={{ fontSize: "10px", letterSpacing: "0.18em" }}
    >
      {children}
    </label>
  );
}

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li
      className="flex items-center gap-1"
      style={{
        color: ok ? "var(--color-rose)" : "var(--color-mute)",
        letterSpacing: "0.10em",
      }}
    >
      <Check
        className="h-3 w-3"
        strokeWidth={2.2}
        style={{ opacity: ok ? 1 : 0.35 }}
      />
      {children}
    </li>
  );
}
