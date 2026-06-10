import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// BigInt no es serializable por JSON.stringify (que usa NextResponse.json).
// mt5Ticket es BigInt (tickets MT5 > INT4); lo serializamos como string en
// todas las respuestas JSON. Se registra una sola vez al cargar el cliente.
const bigintProto = BigInt.prototype as unknown as { toJSON?: () => string };
if (typeof bigintProto.toJSON !== "function") {
  bigintProto.toJSON = function (this: bigint) {
    return this.toString();
  };
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
