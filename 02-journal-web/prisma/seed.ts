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

  const count = await prisma.task.count({ where: { userId: user.id } });
  if (count > 0) {
    console.log(
      `[seed] el usuario ya tiene ${count} tasks — skip (no quiero duplicar).`,
    );
    return;
  }

  await prisma.task.createMany({
    data: SEED_TASKS.map((t) => ({ ...t, userId: user.id })),
  });
  console.log(`[seed] insertadas ${SEED_TASKS.length} tasks para ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
