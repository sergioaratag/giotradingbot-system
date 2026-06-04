import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Limpieza de trades de prueba creados al testear los endpoints del bot.
 *
 * NOTA: el modelo Trade NO tiene campo `comment` (el payload del bot trae
 * "comment" pero el handler nunca lo persiste). Por eso NO se puede filtrar
 * por comment — se filtra por la whitelist de mt5Ticket de abajo.
 *
 * Seguridad:
 *   - Solo borra trades cuyo mt5Ticket esta en TEST_TICKETS.
 *   - Guard extra: solo borra los que tienen source === "BOT". Cualquier trade
 *     con uno de esos tickets pero source "MANUAL" se reporta y se OMITE
 *     (los trades manuales legitimos tienen mt5Ticket null por diseno).
 *   - Las TradeConfluence hijas se borran solas (onDelete: Cascade en schema).
 *
 * Uso:
 *   npx tsx scripts/cleanup-test-trades.ts --dry-run   # solo muestra, no borra
 *   npx tsx scripts/cleanup-test-trades.ts             # borra de verdad
 */

const TEST_TICKETS = [99999, 99998, 99997, 99996, 99995, 88888, 66666, 55555];

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(DRY_RUN ? "== DRY RUN (no se borra nada) ==\n" : "== CLEANUP ==\n");

  const candidates = await prisma.trade.findMany({
    where: { mt5Ticket: { in: TEST_TICKETS } },
    select: {
      id: true,
      mt5Ticket: true,
      source: true,
      pair: true,
      direction: true,
      entryTime: true,
      pnlUSD: true,
      rAchieved: true,
    },
    orderBy: { mt5Ticket: "asc" },
  });

  console.log(`Trades con mt5Ticket en la whitelist: ${candidates.length}`);
  for (const t of candidates) {
    console.log(
      `  ticket=${t.mt5Ticket} | source=${t.source} | ${t.pair} ${t.direction} | entry=${t.entryTime.toISOString()}`,
    );
  }

  const toDelete = candidates.filter((t) => t.source === "BOT");
  const skipped = candidates.filter((t) => t.source !== "BOT");

  if (skipped.length > 0) {
    console.log(`\n⚠️  OMITIDOS por source !== "BOT" (no se tocan):`);
    for (const t of skipped) {
      console.log(`  ticket=${t.mt5Ticket} | source=${t.source}`);
    }
  }

  let deleted = 0;
  if (!DRY_RUN && toDelete.length > 0) {
    const res = await prisma.trade.deleteMany({
      where: { id: { in: toDelete.map((t) => t.id) } },
    });
    deleted = res.count;
    console.log(`\n✅ Borrados: ${deleted}`);
  } else {
    console.log(
      `\n${DRY_RUN ? "(dry-run) Se borrarian" : "Nada para borrar:"} ${toDelete.length} trade(s).`,
    );
  }

  // Estado final de la BD
  const remaining = await prisma.trade.findMany({
    orderBy: { entryTime: "asc" },
    select: {
      mt5Ticket: true,
      source: true,
      pair: true,
      direction: true,
      entryTime: true,
      pnlUSD: true,
      rAchieved: true,
    },
  });
  console.log(`\n--- Trades restantes en BD: ${remaining.length} ---`);
  for (const t of remaining) {
    console.log(
      `  ticket=${t.mt5Ticket ?? "null"} | source=${t.source} | ${t.pair} ${t.direction} | entry=${t.entryTime.toISOString()} | pnl=${t.pnlUSD ?? "-"} | R=${t.rAchieved ?? "-"}`,
    );
  }
}

main()
  .catch((e) => {
    console.error("Error en cleanup:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
