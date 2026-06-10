import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Fase 2.6 — Gate de OWNER para endpoints que modifican el bot.
// Devuelve { ok:true, userId } si el usuario logueado es OWNER, o
// { ok:false, response } con un 401/403 listo para retornar.
export async function requireOwner(): Promise<
  | { ok: true; userId: string; email: string | null | undefined }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "OWNER") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden — solo el OWNER puede modificar el bot." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: session.user.id, email: session.user.email };
}
