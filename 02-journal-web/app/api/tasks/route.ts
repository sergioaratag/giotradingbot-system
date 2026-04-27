import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, TaskStatus, Priority } from "@prisma/client";

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "DONE"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function isStatus(s: string): s is TaskStatus {
  return (STATUSES as readonly string[]).includes(s);
}
function isPriority(p: string): p is Priority {
  return (PRIORITIES as readonly string[]).includes(p);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const forClaudeCode = searchParams.get("forClaudeCode");

  const where: Prisma.TaskWhereInput = { userId: session.user.id };
  if (status && isStatus(status)) where.status = status;
  if (priority && isPriority(priority)) where.priority = priority;
  if (forClaudeCode === "true") where.forClaudeCode = true;
  if (forClaudeCode === "false") where.forClaudeCode = false;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [
      { priority: "desc" },
      { status: "asc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const priority = isPriority(String(body.priority))
    ? (body.priority as Priority)
    : undefined;
  const status = isStatus(String(body.status))
    ? (body.status as TaskStatus)
    : undefined;

  const task = await prisma.task.create({
    data: {
      userId: session.user.id,
      title,
      description: body.description ? String(body.description) : null,
      priority,
      status,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      forClaudeCode: Boolean(body.forClaudeCode),
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
