import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AUTHORIZED_USERS, isAuthorizedEmail, roleForEmail } from "@/lib/authorized-users";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const name = body.name ? String(body.name).trim() : null;

  // Fase 2.3 — La whitelist ES el control de acceso al registro. Solo los
  // emails autorizados (familia) pueden crear cuenta; el resto, 403.
  if (!isAuthorizedEmail(email)) {
    console.warn(`[AUTH] Registro no autorizado rechazado: ${email}`);
    return NextResponse.json(
      { error: "Email no autorizado para registrarse." },
      { status: 403 },
    );
  }

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Email y contraseña (≥8) requeridos." },
      { status: 400 },
    );
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json(
      { error: "Email ya registrado." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const fallbackName = AUTHORIZED_USERS.find((u) => u.email.toLowerCase() === email)?.name ?? null;
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name ?? fallbackName, role: roleForEmail(email) },
    select: { id: true, email: true, name: true, role: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
