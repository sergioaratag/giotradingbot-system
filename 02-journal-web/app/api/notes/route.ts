import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const search = searchParams.get("search")?.trim();

  const where: Prisma.NoteWhereInput = { userId: session.user.id };
  if (category) where.category = category;
  if (tag) where.tags = { has: tag };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  const notes = await prisma.note.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim() || "Sin título";
  const content = typeof body.content === "string" ? body.content : "";
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : null;
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];

  const note = await prisma.note.create({
    data: {
      userId: session.user.id,
      title,
      content,
      category,
      tags,
    },
  });

  return NextResponse.json({ note }, { status: 201 });
}
