import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const owned = await prisma.drawing.findFirst({ where: { id, userId: session.user.id } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const num = (v: unknown): number | null | undefined =>
    v === undefined ? undefined : v != null && Number.isFinite(Number(v)) ? Number(v) : null;

  const drawing = await prisma.drawing.update({
    where: { id },
    data: {
      geometry: body.geometry !== undefined ? (body.geometry as Prisma.InputJsonValue) : undefined,
      entryPrice: num(body.entryPrice),
      slPrice: num(body.slPrice),
      tpPrice: num(body.tpPrice),
      volume: num(body.volume),
      riskUsd: num(body.riskUsd),
      rRatio: num(body.rRatio),
      color: body.color !== undefined ? String(body.color) : undefined,
      label: body.label !== undefined ? (body.label ? String(body.label) : null) : undefined,
    },
  });
  return NextResponse.json({ drawing });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const owned = await prisma.drawing.findFirst({ where: { id, userId: session.user.id } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.drawing.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
