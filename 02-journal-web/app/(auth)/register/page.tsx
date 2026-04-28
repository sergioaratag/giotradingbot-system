"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function RegisterPage() {
  const router = useRouter();
  const allowRegistration = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION === "true";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!allowRegistration) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mb-10 flex justify-center">
          <Logo size="lg" />
        </div>
        <h1
          className="text-2xl text-cream"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Registro deshabilitado
        </h1>
        <p className="mt-3 text-sm text-dust">
          Este sistema es de uso personal. Si necesitas acceso, pídele al owner.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block text-xs text-rose hover:text-rose-deep uppercase"
          style={{ letterSpacing: "0.18em" }}
        >
          ← Volver
        </Link>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo crear la cuenta.");
        return;
      }
      router.push("/login");
    });
  }

  const inputCls =
    "w-full bg-transparent py-2 px-0 text-cream text-sm outline-none transition-colors";
  const inputStyle = { borderBottom: "0.5px solid var(--color-graphite)" } as const;

  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-12 gio-slide-up">
        <Logo size="lg" />
      </div>

      <form onSubmit={onSubmit} className="space-y-7">
        {([
          { label: "Nombre", value: name, setter: setName, type: "text", auto: undefined },
          { label: "Email", value: email, setter: setEmail, type: "email", auto: "email" },
          { label: "Contraseña", value: password, setter: setPassword, type: "password", auto: "new-password" },
        ] as const).map((f, i) => (
          <div key={f.label} className="gio-slide-up" style={{ animationDelay: `${200 + i * 120}ms` }}>
            <label
              className="block text-mute mb-1.5 uppercase"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            >
              {f.label}
            </label>
            <input
              type={f.type}
              required
              minLength={f.type === "password" ? 8 : undefined}
              autoComplete={f.auto}
              value={f.value}
              onChange={(e) => f.setter(e.target.value)}
              className={inputCls}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderBottom = "0.5px solid var(--color-rose)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderBottom =
                  "0.5px solid var(--color-graphite)")
              }
            />
          </div>
        ))}

        {error && (
          <p className="text-xs" style={{ color: "var(--color-rose-deep)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 px-12 rounded-md text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "var(--color-rose)",
            color: "var(--color-onyx)",
            letterSpacing: "3px",
          }}
        >
          {pending ? "Creando…" : "Crear cuenta"}
        </button>

        <p className="text-center text-xs text-mute">
          <Link href="/login" className="hover:text-rose">
            Ya tengo cuenta
          </Link>
        </p>
      </form>
    </div>
  );
}
