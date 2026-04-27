import { prisma } from "@/lib/prisma";

const PRIORITY_ICON: Record<string, string> = {
  URGENT: "🔥",
  HIGH: "⚡",
  MEDIUM: "·",
  LOW: "·",
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.BOT_API_KEY ?? ""}`;
  if (!process.env.BOT_API_KEY || auth !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tasks = await prisma.task.findMany({
    where: {
      forClaudeCode: true,
      status: { in: ["TODO", "IN_PROGRESS"] },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  if (tasks.length === 0) {
    return new Response("# Tareas para Claude Code\n\n_(ninguna pendiente)_\n", {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const lines: string[] = ["# Tareas para Claude Code\n"];
  for (const t of tasks) {
    lines.push(
      `## ${PRIORITY_ICON[t.priority] ?? "·"} [${t.status}] ${t.title}`,
    );
    lines.push(`**Prioridad:** ${t.priority}`);
    if (t.tags.length) lines.push(`**Tags:** ${t.tags.join(", ")}`);
    if (t.description) lines.push(`\n${t.description}`);
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
