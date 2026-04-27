"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-midnight-50">Registro deshabilitado</h1>
        <p className="mt-2 text-midnight-300">
          Este sistema es de uso personal. Si necesitas acceso, pídele al owner.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-info hover:underline"
        >
          ← Volver al login
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
          <label className="block text-sm text-midnight-300 mb-1.5">Nombre</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-midnight-800 border border-midnight-700 rounded-md px-3 py-2 text-midnight-50 outline-none focus:border-info"
          />
        </div>

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
            minLength={8}
            autoComplete="new-password"
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
          {pending ? "Creando..." : "Crear cuenta"}
        </button>

        <p className="text-center text-sm text-midnight-400">
          <Link href="/login" className="text-info hover:underline">
            Ya tengo cuenta
          </Link>
        </p>
      </form>
    </div>
  );
}
