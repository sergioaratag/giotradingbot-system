import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Fase 1.2 — Reconciliación manual de los 4 trades del bot del 2026-06-09 que
 * NUNCA llegaron al journal (POST de apertura/cierre falló). Verificados por
 * Sergio en MT5 → History (cuenta demo 108031503, MetaQuotes Hedge).
 *
 * Están CERRADOS, por eso se insertan con exitPrice/exitTime/pnlUSD (el modelo
 * Trade NO tiene columna `status`; el estado "cerrado" se representa con esos
 * campos, igual que /api/bot/trade/closed).
 *
 * Flags:
 *   - source = BOT
 *   - excludeFromStats = true  → NO siguen la estrategia ICT (SL gigantes de
 *     174/594 pips, volúmenes 0.6 vs 0.08): hay un bug de Sizing a resolver en
 *     fase futura. Quedan como evidencia histórica pero FUERA de stats.
 *   - isShared = true          → prep multi-user.
 *
 * Idempotente: upsert por mt5Ticket (unique). Re-correrlo no duplica.
 *
 * ⚠️ ZONA HORARIA: las horas vienen de MT5 (hora del servidor). Acá se guardan
 * tal cual, interpretadas como UTC. Si el server MT5 es GMT+X, las horas quedan
 * corridas X horas — avisar y se ajusta. NO afecta stats (excludeFromStats).
 *
 * Uso:
 *   npx tsx scripts/insert-recovered-bot-trades.ts --dry-run   # solo muestra
 *   npx tsx scripts/insert-recovered-bot-trades.ts             # inserta
 */

const OWNER_EMAIL = "gioarata10@gmail.com";
const DRY_RUN = process.argv.includes("--dry-run");

// El server MT5 (MetaQuotes-Demo) corre en GMT+3 (EEST en junio). Lo confirma
// que las aperturas 18:20–18:54 MT5 = 15:20–15:54 UTC coinciden exactamente con
// los BotEvent de rechazo por cap de riesgo (estaban abiertas en esa ventana).
// Restamos 3h para guardar entryTime/exitTime en UTC correcto.
const MT5_UTC_OFFSET_HOURS = 3;

type Src = {
  mt5Ticket: number;
  pair: string;
  side: "BUY" | "SELL";
  volume: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  openTime: string; // "YYYY-MM-DD HH:mm:ss" (MT5 server time, tratado como UTC)
  closeTime: string;
  closePrice: number;
  profit: number;
};

const TRADES: Src[] = [
  { mt5Ticket: 8997342859, pair: "GBPUSD", side: "BUY", volume: 0.1, entryPrice: 1.33835, stopLoss: 1.33323, takeProfit: null, openTime: "2026-06-09 18:42:00", closeTime: "2026-06-09 18:44:58", closePrice: 1.33846, profit: 1.1 },
  { mt5Ticket: 8996518442, pair: "EURUSD", side: "SELL", volume: 0.6, entryPrice: 1.15597, stopLoss: 1.15763, takeProfit: 1.15255, openTime: "2026-06-09 18:20:00", closeTime: "2026-06-09 18:52:53", closePrice: 1.1555, profit: 28.2 },
  { mt5Ticket: 8997676911, pair: "GBPUSD", side: "BUY", volume: 0.56, entryPrice: 1.33867, stopLoss: 1.33693, takeProfit: null, openTime: "2026-06-09 18:54:02", closeTime: "2026-06-09 19:38:18", closePrice: 1.33693, profit: -97.44 },
  { mt5Ticket: 8997628921, pair: "EURUSD", side: "BUY", volume: 0.08, entryPrice: 1.15555, stopLoss: 1.14961, takeProfit: null, openTime: "2026-06-09 18:52:00", closeTime: "2026-06-09 22:20:02", closePrice: 1.15436, profit: -9.52 },
];

function toUTC(s: string): Date {
  // "YYYY-MM-DD HH:mm:ss" (hora MT5, GMT+3) → Date en UTC real.
  const mt5AsUtc = new Date(s.replace(" ", "T") + "Z");
  return new Date(mt5AsUtc.getTime() - MT5_UTC_OFFSET_HOURS * 3600 * 1000);
}

async function main() {
  console.log(DRY_RUN ? "== DRY RUN (no inserta nada) ==\n" : "== INSERT ==\n");

  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) {
    console.error(`❌ No existe el usuario ${OWNER_EMAIL}. Abortando.`);
    return;
  }
  console.log(`Owner: ${owner.email} (${owner.id})\n`);

  let net = 0;
  for (const t of TRADES) {
    const direction = t.side === "BUY" ? "LONG" : "SHORT";
    const ticket = BigInt(t.mt5Ticket);
    const existing = await prisma.trade.findUnique({ where: { mt5Ticket: ticket } });
    net += t.profit;

    const data = {
      userId: owner.id,
      mt5Ticket: ticket,
      source: "BOT" as const,
      pair: t.pair,
      direction: direction as "LONG" | "SHORT",
      entryPrice: t.entryPrice,
      stopLoss: t.stopLoss,
      takeProfit1: t.takeProfit ?? null,
      exitPrice: t.closePrice,
      positionSize: t.volume,
      riskPercent: 0,
      riskUSD: 0,
      pnlUSD: t.profit,
      entryTime: toUTC(t.openTime),
      exitTime: toUTC(t.closeTime),
      excludeFromStats: true,
      isShared: true,
      notes: "Reconciliado manual (Fase 1.2). NO sigue estrategia ICT — excludeFromStats.",
    };

    console.log(
      `  ticket=${t.mt5Ticket} | ${t.pair} ${direction} ${t.volume} | entry=${t.entryPrice} sl=${t.stopLoss} tp=${t.takeProfit ?? "—"} | exit=${t.closePrice} | pnl=${t.profit >= 0 ? "+" : ""}${t.profit} | ${existing ? "YA EXISTE → update" : "NUEVO → create"}`,
    );

    if (!DRY_RUN) {
      await prisma.trade.upsert({
        where: { mt5Ticket: ticket },
        create: data,
        update: data,
      });
    }
  }

  console.log(`\nBalance neto de los 4: ${net >= 0 ? "+" : ""}${net.toFixed(2)} USD (excluido de stats)`);
  if (DRY_RUN) console.log("\n(DRY RUN — re-ejecutar sin --dry-run para insertar de verdad.)");
  else console.log("\n✅ Insert/upsert completado.");
}

main()
  .catch((e) => { console.error("ERROR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
