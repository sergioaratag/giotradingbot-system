import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, TaskStatus, Priority } from "@prisma/client";

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "DONE"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function isStatus(s: unknown): s is TaskStatus {
  return typeof s === "string" && (STATUSES as readonly string[]).includes(s);
}
function isPriority(p: unknown): p is Priority {
  return typeof p === "string" && (PRIORITIES as readonly string[]).includes(p);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const task = await prisma.task.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const owned = await prisma.task.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Prisma.TaskUpdateInput = {};

  if (typeof body.title === "string") data.title = body.title.trim();
  if (body.description !== undefined)
    data.description = body.description ? String(body.description) : null;
  if (isPriority(body.priority)) data.priority = body.priority;
  if (Array.isArray(body.tags)) data.tags = body.tags.map(String);
  if (typeof body.forClaudeCode === "boolean")
    data.forClaudeCode = body.forClaudeCode;

  if (isStatus(body.status)) {
    data.status = body.status;
    if (body.status === "DONE" && owned.status !== "DONE") {
      data.completedAt = new Date();
    }
    if (body.status !== "DONE" && owned.status === "DONE") {
      data.completedAt = null;
    }
  }

  const task = await prisma.task.update({ where: { id }, data });
  return NextResponse.json({ task });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await prisma.task.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
