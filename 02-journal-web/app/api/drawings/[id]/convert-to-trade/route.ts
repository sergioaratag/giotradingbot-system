import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Fase 6B — Convierte un dibujo LONG_POSITION/SHORT_POSITION en un trade manual.
export async function POST(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const d = await prisma.drawing.findFirst({ where: { id, userId: session.user.id } });
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (d.type !== "LONG_POSITION" && d.type !== "SHORT_POSITION") {
    return NextResponse.json({ error: "El dibujo no es una posición" }, { status: 400 });
  }
  if (d.entryPrice == null || d.slPrice == null) {
    return NextResponse.json({ error: "Faltan entry/SL" }, { status: 400 });
  }

  const trade = await prisma.trade.create({
    data: {
      userId: session.user.id,
      source: "MANUAL",
      isShared: false,
      pair: d.pair,
      direction: d.type === "LONG_POSITION" ? "LONG" : "SHORT",
      entryPrice: d.entryPrice,
      stopLoss: d.slPrice,
      takeProfit1: d.tpPrice ?? null,
      positionSize: d.volume ?? 0.1,
      riskPercent: 0,
      riskUSD: d.riskUsd ?? 0,
      entryTime: new Date(),
      notes: "Creado desde una posición dibujada en el chart (Fase 6B).",
    },
  });
  return NextResponse.json({ trade }, { status: 201 });
}
