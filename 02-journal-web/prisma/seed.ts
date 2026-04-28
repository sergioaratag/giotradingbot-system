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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
