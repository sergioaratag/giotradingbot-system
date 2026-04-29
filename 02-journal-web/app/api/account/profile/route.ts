import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const data: { name?: string | null } = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    data.name = trimmed.length ? trimmed : null;
  }
  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, email: true, name: true },
  });
  return NextResponse.json({ user });
}
