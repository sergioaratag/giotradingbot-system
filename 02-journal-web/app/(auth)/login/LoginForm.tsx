"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/dashboard";
  const allowRegistration =
    process.env.NEXT_PUBLIC_ALLOW_REGISTRATION === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Email o contraseña inválidos.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <FieldLabel label="Email" delay={200}>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-transparent py-2 px-0 text-cream text-sm outline-none transition-colors"
          style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
          onFocus={(e) =>
            (e.currentTarget.style.borderBottom =
              "0.5px solid var(--color-rose)")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderBottom =
              "0.5px solid var(--color-graphite)")
          }
        />
      </FieldLabel>

      <FieldLabel label="Contraseña" delay={350}>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-transparent py-2 px-0 text-cream text-sm outline-none transition-colors"
          style={{ borderBottom: "0.5px solid var(--color-graphite)" }}
          onFocus={(e) =>
            (e.currentTarget.style.borderBottom =
              "0.5px solid var(--color-rose)")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderBottom =
              "0.5px solid var(--color-graphite)")
          }
        />
      </FieldLabel>

      {error && (
        <p
          className="text-xs gio-slide-up"
          style={{ color: "var(--color-rose-deep)" }}
        >
          {error}
        </p>
      )}

      <div
        className="pt-2 gio-slide-up"
        style={{ animationDelay: "500ms" }}
      >
        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 px-12 rounded-md text-xs uppercase font-medium transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "var(--color-rose)",
            color: "var(--color-onyx)",
            letterSpacing: "3px",
          }}
          onMouseEnter={(e) =>
            !pending &&
            (e.currentTarget.style.background = "var(--color-rose-deep)")
          }
          onMouseLeave={(e) =>
            !pending &&
            (e.currentTarget.style.background = "var(--color-rose)")
          }
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </div>

      {allowRegistration && (
        <p className="text-center text-xs text-mute pt-2">
          ¿Sin cuenta?{" "}
          <Link href="/register" className="text-rose hover:text-rose-deep">
            Crear una
          </Link>
        </p>
      )}
    </form>
  );
}

function FieldLabel({
  label,
  delay,
  children,
}: {
  label: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div className="gio-slide-up" style={{ animationDelay: `${delay}ms` }}>
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
