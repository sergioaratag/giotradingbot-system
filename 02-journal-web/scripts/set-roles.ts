import "dotenv/config";
import { prisma } from "../lib/prisma";
import { AUTHORIZED_USERS, roleForEmail } from "../lib/authorized-users";

/**
 * Fase 2.1 — Asigna el rol correcto a los usuarios EXISTENTES según la
 * whitelist (lib/authorized-users). NO crea cuentas (eso es auto-registro;
 * requiere password). Solo actualiza el rol de los que ya existen.
 *
 * Uso:
 *   npx tsx scripts/set-roles.ts --dry-run
 *   npx tsx scripts/set-roles.ts
 */

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(DRY_RUN ? "== DRY RUN ==\n" : "== SET ROLES ==\n");

  for (const u of AUTHORIZED_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
      select: { id: true, email: true, role: true },
    });
    if (!existing) {
      console.log(`  ${u.email} → (sin cuenta todavía; se creará por auto-registro como ${u.role})`);
      continue;
    }
    const target = roleForEmail(u.email);
    if (existing.role === target) {
      console.log(`  ${u.email} → ya es ${target} (sin cambio)`);
      continue;
    }
    console.log(`  ${u.email} → ${existing.role} ⇒ ${target}`);
    if (!DRY_RUN) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: target } });
    }
  }

  if (DRY_RUN) console.log("\n(DRY RUN — re-ejecutar sin --dry-run para aplicar.)");
}

main()
  .catch((e) => { console.error("ERROR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
