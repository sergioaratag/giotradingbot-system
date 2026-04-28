import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { VaultType } from "@prisma/client";

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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.vaultEntry.findMany({
    where: { userId: session.user.id },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const content = String(body.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (!isType(body.type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const entry = await prisma.vaultEntry.create({
    data: {
      userId: session.user.id,
      type: body.type,
      title: body.title ? String(body.title).trim() : null,
      content,
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      pinned: Boolean(body.pinned),
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
