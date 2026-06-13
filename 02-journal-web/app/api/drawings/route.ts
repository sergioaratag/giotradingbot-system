import { NextResponse } from "next/server";
import { Prisma, type DrawingType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAIRS = ["EURUSD", "GBPUSD"];
const TYPES: DrawingType[] = [
  "HORIZONTAL_LINE",
  "VERTICAL_LINE",
  "TRENDLINE",
  "RECTANGLE",
  "TEXT",
  "FREEHAND",
  "LONG_POSITION",
  "SHORT_POSITION",
];

// Fase 6B — Dibujos del usuario sobre el chart. Per-user, por par (+TF opcional).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pair = String(searchParams.get("pair") ?? "").toUpperCase();
  const timeframe = searchParams.get("timeframe");
  if (!PAIRS.includes(pair)) return NextResponse.json({ error: "pair inválido" }, { status: 400 });

  const drawings = await prisma.drawing.findMany({
    where: {
      userId: session.user.id,
      pair,
      // timeframe null = visible en todos los TFs; específico = solo ese TF.
      ...(timeframe ? { OR: [{ timeframe: null }, { timeframe }] } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ drawings });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pair = String(body.pair ?? "").toUpperCase();
  const type = body.type as DrawingType;
  if (!PAIRS.includes(pair) || !TYPES.includes(type)) {
    return NextResponse.json({ error: "pair y type válidos requeridos" }, { status: 400 });
  }

  const num = (v: unknown): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;

  const drawing = await prisma.drawing.create({
    data: {
      userId: session.user.id,
      pair,
      timeframe: body.timeframe ? String(body.timeframe) : null,
      type,
      geometry: (body.geometry ?? {}) as Prisma.InputJsonValue,
      entryPrice: num(body.entryPrice),
      slPrice: num(body.slPrice),
      tpPrice: num(body.tpPrice),
      volume: num(body.volume),
      riskUsd: num(body.riskUsd),
      rRatio: num(body.rRatio),
      color: body.color ? String(body.color) : undefined,
      width: body.width != null && Number.isFinite(Number(body.width)) ? Math.round(Number(body.width)) : undefined,
      lineStyle: body.lineStyle === "DASHED" ? "DASHED" : body.lineStyle === "SOLID" ? "SOLID" : undefined,
      label: body.label ? String(body.label) : null,
    },
  });
  return NextResponse.json({ drawing }, { status: 201 });
}
