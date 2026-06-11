import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeChartTheme, DEFAULT_CHART_THEME } from "@/lib/chart-theme";

export const dynamic = "force-dynamic";

// PR #14 — Paleta del chart del usuario.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { chartTheme: true },
  });
  return NextResponse.json({
    theme: user?.chartTheme ? normalizeChartTheme(user.chartTheme) : DEFAULT_CHART_THEME,
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const theme = normalizeChartTheme(body.theme ?? body);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { chartTheme: theme as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ theme });
}
