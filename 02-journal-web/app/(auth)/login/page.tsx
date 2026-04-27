"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/dashboard";
  const allowRegistration = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION === "true";

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
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-midnight-50 to-midnight-300 bg-clip-text text-transparent">
          CheoTrader
        </h1>
        <p className="mt-1 text-sm text-midnight-300">ICT Trading System</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-midnight-900 border border-midnight-800 rounded-lg p-6 space-y-4"
      >
        <div>
          <label className="block text-sm text-midnight-300 mb-1.5">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info"
          />
        </div>

        <div>
          <label className="block text-sm text-midnight-300 mb-1.5">
            Contraseña
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info"
          />
        </div>

        {error && <p className="text-sm text-loss">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-info hover:bg-info/90 disabled:opacity-60 text-white font-medium rounded-md px-4 py-2 transition-colors"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>

        {allowRegistration && (
          <p className="text-center text-sm text-midnight-400">
            ¿Sin cuenta?{" "}
            <Link href="/register" className="text-info hover:underline">
              Crear una
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
