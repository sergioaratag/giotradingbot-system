import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Fase 1.3 — Borra los trades SEED creados por prisma/seed.ts.
 *
 * Criterio estricto (las 3 condiciones a la vez):
 *   - source = MANUAL          (los del bot son BOT, NO se tocan)
 *   - mt5Ticket = null         (los reales del bot siempre traen ticket)
 *   - createdAt < 2026-06-01   (whitelist por fecha: seed de abril 2026)
 *
 * Esto matchea exactamente los 5 trades EUR-USD/GBP-USD del 2026-04-28.
 * Las TradeConfluence hijas se borran solas (onDelete: Cascade).
 *
 * Uso:
 *   npx tsx scripts/cleanup-seed-trades.ts --dry-run   # solo muestra
 *   npx tsx scripts/cleanup-seed-trades.ts             # borra
 */

const CUTOFF = new Date("2026-06-01T00:00:00Z");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(DRY_RUN ? "== DRY RUN (no borra nada) ==\n" : "== CLEANUP ==\n");

  const candidates = await prisma.trade.findMany({
    where: { source: "MANUAL", mt5Ticket: null, createdAt: { lt: CUTOFF } },
    select: { id: true, source: true, pair: true, direction: true, mt5Ticket: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Trades seed candidatos (MANUAL + ticket null + createdAt < 2026-06-01): ${candidates.length}`);
  for (const t of candidates) {
    console.log(`  ${t.id} | ${t.source} | ${t.pair} ${t.direction} | ticket=${t.mt5Ticket ?? "null"} | ${t.createdAt.toISOString()}`);
  }

  // Guard defensivo: jamás tocar trades del bot.
  const safe = candidates.filter((t) => t.source === "MANUAL" && t.mt5Ticket === null);
  if (safe.length !== candidates.length) {
    console.error("⚠️ Inconsistencia: algún candidato no cumple el guard. Abortando.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n(DRY RUN — re-ejecutar sin --dry-run para borrar.)");
    return;
  }

  const result = await prisma.trade.deleteMany({
    where: { id: { in: safe.map((t) => t.id) } },
  });
  console.log(`\n✅ Borrados ${result.count} trades seed.`);
}

main()
  .catch((e) => { console.error("ERROR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
