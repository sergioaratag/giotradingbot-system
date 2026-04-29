import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const note = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ note });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const owned = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Prisma.NoteUpdateInput = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    data.title = t || "Sin título";
  }
  if (typeof body.content === "string") data.content = body.content;
  if (body.category !== undefined) {
    const c =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : null;
    data.category = c;
  }
  if (Array.isArray(body.tags)) data.tags = body.tags.map(String);

  const note = await prisma.note.update({ where: { id }, data });
  return NextResponse.json({ note });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
