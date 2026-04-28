import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const SEED_TASKS = [
  {
    title: "Implementar página de Trades con CRUD",
    description:
      "Tabla de trades con filtros (par, sesión, fuente bot/manual). Form de creación manual. Detalle por trade con screenshot. Empezar por GET /api/trades + page list.",
    priority: "URGENT" as const,
    status: "TODO" as const,
    tags: ["frontend", "trades", "v1"],
    forClaudeCode: true,
  },
  {
    title: "Crear endpoint POST /api/bot/trade para recibir trades del EA",
    description:
      "Validar header X-Bot-Api-Key contra BOT_API_KEY. Schema Zod del payload. Persistir como Trade con source=BOT. Devolver 201 con id.",
    priority: "HIGH" as const,
    status: "TODO" as const,
    tags: ["backend", "bot", "api"],
    forClaudeCode: true,
  },
  {
    title: "Realizar backtest manual de 30 setups históricos en TradingView",
    description:
      "Fase 0 del roadmap. Marcar 30 setups en EUR/USD y GBP/USD de los últimos 3 meses. Anotar entry/SL/TP/resultado en planilla en 03-docs/backtest/resultados/. Validar WR ≥ 50% y expectancy ≥ 0.3R antes de tocar código del bot.",
    priority: "MEDIUM" as const,
    status: "BACKLOG" as const,
    tags: ["fase-0", "backtest", "manual"],
    forClaudeCode: false,
  },
  {
    title: "Implementar página de Notes con editor markdown",
    description:
      "CRUD de notas con preview markdown lado a lado. Categorías y tags. Búsqueda full-text. Atajo cmd+k para nueva nota.",
    priority: "MEDIUM" as const,
    status: "BACKLOG" as const,
    tags: ["frontend", "notes"],
    forClaudeCode: true,
  },
  {
    title: "Configurar VPS para producción",
    description:
      "Contratar VPS Windows con baja latencia al broker. Instalar MT5. Configurar arranque automático del EA al boot. Documentar en 03-docs/notes/decisiones.md.",
    priority: "LOW" as const,
    status: "BACKLOG" as const,
    tags: ["infra", "produccion", "manual"],
    forClaudeCode: false,
  },
];

const SEED_VAULT = [
  {
    type: "QUOTE" as const,
    title: "Mark Douglas",
    content: "El mercado no premia al ocupado, premia al paciente.",
    pinned: true,
  },
  {
    type: "GOAL" as const,
    title: "Pasar el challenge de Orion",
    content:
      "En menos de 30 días. Disciplina diaria, riesgo dentro de plan.",
    pinned: true,
  },
  {
    type: "REMINDER" as const,
    title: "Quién soy en el mercado",
    content:
      "Eres planificador. Eres paciente. Eres letal cuando aparece tu setup.",
    pinned: false,
  },
];

function daysAgo(days: number, hour = 9, minute = 30): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const SEED_TRADES = [
  {
    pair: "EUR-USD",
    direction: "SHORT" as const,
    qualityRating: "HIGH" as const,
    biasHTF: "BEARISH" as const,
    killzone: "NY-AM-KZ",
    entryPrice: 1.08923,
    stopLoss: 1.09081,
    takeProfit1: 1.08745,
    takeProfit2: 1.0855,
    exitPrice: 1.08621,
    positionSize: 1.0,
    riskPercent: 1.5,
    riskUSD: 150,
    tp1Hit: true,
    tp2Hit: false,
    beHit: false,
    rAchieved: 2.1,
    pnlUSD: 285,
    entryTime: daysAgo(2, 9, 35),
    exitTime: daysAgo(2, 11, 15),
    preTradeNotes:
      "Sweep H1 sobre London High en NY-AM. FVG limpio en 5m. Bias bearish del daily.",
    postTradeNotes:
      "Salida limpia en TP1, fui demasiado conservador con TP2.",
    confluences: [
      "SWEEP-H1",
      "LDN-H",
      "FVG",
      "CHoCH",
      "NY-AM-KZ",
      "PREMIUM",
      "SILVER-BULLET",
    ],
  },
  {
    pair: "GBP-USD",
    direction: "LONG" as const,
    qualityRating: "MEDIUM" as const,
    biasHTF: "BULLISH" as const,
    killzone: "NY-AM-KZ",
    entryPrice: 1.27015,
    stopLoss: 1.26865,
    takeProfit1: 1.27315,
    positionSize: 1.0,
    riskPercent: 1.0,
    riskUSD: 150,
    tp1Hit: false,
    beHit: false,
    rAchieved: -1,
    pnlUSD: -150,
    entryTime: daysAgo(5, 9, 50),
    exitTime: daysAgo(5, 10, 20),
    preTradeNotes: "Sweep 15m, FVG en discount. Setup B.",
    postTradeNotes:
      "Stop limpio. Mercado no respetó la zona, news escondidas.",
    confluences: ["SWEEP-15M", "FVG", "DISCOUNT", "NY-AM-KZ"],
  },
  {
    pair: "EUR-USD",
    direction: "SHORT" as const,
    qualityRating: "HIGH" as const,
    biasHTF: "BEARISH" as const,
    killzone: "NY-AM-KZ",
    entryPrice: 1.0908,
    stopLoss: 1.0922,
    takeProfit1: 1.0892,
    takeProfit2: 1.0875,
    exitPrice: 1.0908,
    positionSize: 1.0,
    riskPercent: 1.5,
    riskUSD: 150,
    tp1Hit: false,
    beHit: true,
    rAchieved: 0,
    pnlUSD: 0,
    entryTime: daysAgo(8, 9, 40),
    exitTime: daysAgo(8, 12, 10),
    preTradeNotes:
      "Sweep H4 sobre EQH. FVG H1 + OB-. Confluencia altísima.",
    postTradeNotes:
      "BE por timing. Setup era válido pero el mercado no extendió.",
    confluences: [
      "SWEEP-H4",
      "EQH",
      "FVG",
      "CHoCH",
      "OB-",
      "PREMIUM",
      "NY-AM-KZ",
      "POWER-OF-3",
    ],
  },
  {
    pair: "GBP-USD",
    direction: "LONG" as const,
    qualityRating: "LOW" as const,
    biasHTF: "BULLISH" as const,
    killzone: "NY-PM-KZ",
    entryPrice: 1.27155,
    stopLoss: 1.27085,
    takeProfit1: 1.27260,
    exitPrice: 1.27260,
    positionSize: 1.0,
    riskPercent: 0.5,
    riskUSD: 50,
    tp1Hit: true,
    rAchieved: 1.5,
    pnlUSD: 75,
    entryTime: daysAgo(12, 13, 45),
    exitTime: daysAgo(12, 14, 30),
    preTradeNotes: "Sweep 5m sobre PDL, FVG pequeño. Setup C, riesgo reducido.",
    postTradeNotes: "Funcionó pero fue sobre el filo. No repetir LOW quality sin más confluencia.",
    confluences: ["PDL", "SWEEP-5M", "FVG"],
  },
  {
    pair: "EUR-USD",
    direction: "SHORT" as const,
    qualityRating: "MEDIUM" as const,
    biasHTF: "BEARISH" as const,
    killzone: "LDN-KZ",
    entryPrice: 1.0895,
    stopLoss: 1.0910,
    takeProfit1: 1.0867,
    exitPrice: 1.0867,
    positionSize: 1.0,
    riskPercent: 1.0,
    riskUSD: 100,
    tp1Hit: true,
    rAchieved: 1.8,
    pnlUSD: 220,
    entryTime: daysAgo(20, 3, 30),
    exitTime: daysAgo(20, 5, 50),
    preTradeNotes:
      "Sweep H1 sobre Asian High. IFVG en 15m + BOS. Killzone LDN.",
    postTradeNotes: "Trade textbook. Salida en TP1 antes de NY open.",
    confluences: ["ASIA-H", "SWEEP-H1", "IFVG", "BOS", "LDN-KZ"],
  },
];

async function main() {
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    console.log(
      "[seed] no hay usuario aún — corre primero `npm run create-user` y vuelve a correr el seed.",
    );
    return;
  }

  const taskCount = await prisma.task.count({ where: { userId: user.id } });
  if (taskCount === 0) {
    await prisma.task.createMany({
      data: SEED_TASKS.map((t) => ({ ...t, userId: user.id })),
    });
    console.log(`[seed] insertadas ${SEED_TASKS.length} tasks para ${user.email}`);
  } else {
    console.log(`[seed] tasks ya existen (${taskCount}) — skip`);
  }

  const vaultCount = await prisma.vaultEntry.count({
    where: { userId: user.id },
  });
  if (vaultCount === 0) {
    await prisma.vaultEntry.createMany({
      data: SEED_VAULT.map((v) => ({ ...v, userId: user.id })),
    });
    console.log(
      `[seed] insertadas ${SEED_VAULT.length} entradas de vault para ${user.email}`,
    );
  } else {
    console.log(`[seed] vault ya existe (${vaultCount}) — skip`);
  }

  const tradeCount = await prisma.trade.count({ where: { userId: user.id } });
  if (tradeCount === 0) {
    for (const t of SEED_TRADES) {
      const { confluences, ...rest } = t;
      await prisma.trade.create({
        data: {
          ...rest,
          userId: user.id,
          source: "MANUAL",
          confluences: {
            create: confluences.map((conceptKey) => ({ conceptKey })),
          },
        },
      });
    }
    console.log(
      `[seed] insertados ${SEED_TRADES.length} trades para ${user.email}`,
    );
  } else {
    console.log(`[seed] trades ya existen (${tradeCount}) — skip`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
