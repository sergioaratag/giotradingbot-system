import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, VaultType } from "@prisma/client";

const TYPES = [
  "GOAL",
  "QUOTE",
  "IMAGE",
  "DREAM",
  "REMINDER",
  "MILESTONE",
] as const;

function isType(s: unknown): s is VaultType {
  return typeof s === "string" && (TYPES as readonly string[]).includes(s);
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await prisma.vaultEntry.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Prisma.VaultEntryUpdateInput = {};

  if (typeof body.title === "string") data.title = body.title.trim() || null;
  if (typeof body.content === "string") data.content = body.content;
  if (body.imageUrl !== undefined)
    data.imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (isType(body.type)) data.type = body.type;

  const entry = await prisma.vaultEntry.update({ where: { id }, data });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await prisma.vaultEntry.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.vaultEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
