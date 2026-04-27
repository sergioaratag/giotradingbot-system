import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("--email") ?? process.env.SEED_USER_EMAIL ?? "").toLowerCase().trim();
  const password = arg("--password") ?? process.env.SEED_USER_PASSWORD ?? "";
  const name = arg("--name") ?? process.env.SEED_USER_NAME ?? null;

  if (!email || !password) {
    console.error(
      "Uso: tsx scripts/create-user.ts --email <e> --password <p> [--name <n>]",
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[create-user] ya existe: ${email} (id=${existing.id})`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true },
  });
  console.log("[create-user] creado:", user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
