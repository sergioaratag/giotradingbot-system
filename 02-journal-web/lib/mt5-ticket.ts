// Parseo robusto del mt5Ticket. Es BigInt en BD (los tickets reales de MT5
// ~9e9 desbordan INT4). El bot lo manda como número JSON (exacto < 2^53) o
// string; aceptamos ambos. Devuelve null si no es un entero válido.
export function parseMt5Ticket(v: unknown): bigint | null {
  if (v == null) return null;
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return Number.isInteger(v) ? BigInt(v) : null;
    if (typeof v === "string") {
      const s = v.trim();
      return /^\d+$/.test(s) ? BigInt(s) : null;
    }
  } catch {
    // BigInt() lanza en valores no enteros — cae a null.
  }
  return null;
}
