// READ-ONLY diagnostic — Fase 0. NO escribe nada. Throwaway (no commitear).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Cargar .env manualmente (sin depender de dotenv).
for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}

function line() { console.log("─".repeat(70)); }

async function main() {
  const { prisma } = await import("../lib/prisma");
  // 1) Usuarios
  line(); console.log("USUARIOS");
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } });
  users.forEach((u) => console.log(`  ${u.id} | ${u.email} | ${u.name ?? "—"} | ${u.createdAt.toISOString()}`));
  console.log(`  TOTAL usuarios: ${users.length}`);

  // 2) Resumen de trades
  line(); console.log("TRADES — RESUMEN");
  const total = await prisma.trade.count();
  const bot = await prisma.trade.count({ where: { source: "BOT" } });
  const manual = await prisma.trade.count({ where: { source: "MANUAL" } });
  const agg = await prisma.trade.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
  console.log(`  total=${total} | BOT=${bot} | MANUAL=${manual}`);
  console.log(`  oldest=${agg._min.createdAt?.toISOString() ?? "—"} | newest=${agg._max.createdAt?.toISOString() ?? "—"}`);

  // 3) Últimos 7 días
  line(); console.log("TRADES — ÚLTIMOS 7 DÍAS");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await prisma.trade.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, source: true, pair: true, direction: true, mt5Ticket: true, entryPrice: true, stopLoss: true, entryTime: true, createdAt: true, exitTime: true, pnlUSD: true, userId: true },
  });
  if (recent.length === 0) console.log("  (ninguno en los últimos 7 días)");
  recent.forEach((t) => console.log(`  ${t.createdAt.toISOString()} | ${t.source} | ${t.pair} ${t.direction} | ticket=${t.mt5Ticket ?? "NULL"} | entry=${t.entryPrice} sl=${t.stopLoss} | exit=${t.exitTime ? t.exitTime.toISOString() : "ABIERTO"} | pnl=${t.pnlUSD ?? "—"} | user=${t.userId}`));

  // 4) BOT sin mt5Ticket (sospechosos)
  line(); console.log("TRADES BOT con mt5Ticket NULL (sospechosos)");
  const botNull = await prisma.trade.findMany({ where: { source: "BOT", mt5Ticket: null }, select: { id: true, pair: true, direction: true, createdAt: true } });
  if (botNull.length === 0) console.log("  (ninguno)");
  botNull.forEach((t) => console.log(`  ${t.id} | ${t.pair} ${t.direction} | ${t.createdAt.toISOString()}`));

  // 5) Seed/mock (createdAt < 2026-06-01)
  line(); console.log("TRADES SEED candidatos (createdAt < 2026-06-01)");
  const cutoff = new Date("2026-06-01T00:00:00Z");
  const seed = await prisma.trade.findMany({ where: { createdAt: { lt: cutoff } }, orderBy: { createdAt: "asc" }, select: { id: true, source: true, pair: true, direction: true, mt5Ticket: true, createdAt: true, userId: true } });
  if (seed.length === 0) console.log("  (ninguno)");
  seed.forEach((t) => console.log(`  ${t.id} | ${t.source} | ${t.pair} ${t.direction} | ticket=${t.mt5Ticket ?? "NULL"} | ${t.createdAt.toISOString()} | user=${t.userId}`));
  console.log(`  TOTAL seed candidatos: ${seed.length}`);

  // 6) BotConfig
  line(); console.log("BOT CONFIG");
  const cfg = await prisma.botConfig.findMany({ select: { key: true, value: true, updatedAt: true } });
  if (cfg.length === 0) console.log("  (sin filas en BotConfig)");
  cfg.forEach((c) => console.log(`  ${c.key} = ${c.value} | updated=${c.updatedAt.toISOString()}`));

  // 7) BotEvent recientes (últimas 24h)
  line(); console.log("BOT EVENTS — ÚLTIMAS 48H");
  const since48 = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const events = await prisma.botEvent.findMany({ where: { timestamp: { gt: since48 } }, orderBy: { timestamp: "desc" }, take: 30, select: { type: true, pair: true, message: true, timestamp: true } });
  if (events.length === 0) console.log("  (ningún BotEvent en 48h)");
  events.forEach((e) => console.log(`  ${e.timestamp.toISOString()} | ${e.type} | ${e.pair ?? "—"} | ${e.message.slice(0, 80)}`));

  // 8) NewsEvent count (sanity)
  line(); console.log("NEWS EVENTS");
  const newsCount = await prisma.newsEvent.count();
  const newsRecent = await prisma.newsEvent.count({ where: { scheduledAt: { gt: since } } });
  console.log(`  total=${newsCount} | próximos/recientes 7d=${newsRecent}`);

  line();
  await prisma.$disconnect();
}

main().catch((e) => { console.error("DIAG ERROR:", e); process.exit(1); });
