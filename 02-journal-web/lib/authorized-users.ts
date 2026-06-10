// Fase 2.2 — Whitelist de usuarios autorizados (multi-user familiar).
//
// El auth es por password (Credentials). NO se pueden sembrar usuarios sin
// contraseña, así que el alta es auto-registro restringido a estos emails:
// se registran solos en /register y eligen su propia contraseña. Cualquier
// email fuera de esta lista es rechazado en el registro y en el login.

export type AuthorizedUser = {
  email: string;
  name: string;
  role: "OWNER" | "MEMBER";
};

export const AUTHORIZED_USERS: AuthorizedUser[] = [
  { email: "gioarata10@gmail.com", name: "Sergio", role: "OWNER" },
  { email: "aarataf@gmail.com", name: "Aldo (Papá)", role: "MEMBER" },
  { email: "fabriaratag@gmail.com", name: "Fabrizio (Hermano)", role: "MEMBER" },
];

const AUTHORIZED_EMAILS = new Set(AUTHORIZED_USERS.map((u) => u.email.toLowerCase()));

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  return !!email && AUTHORIZED_EMAILS.has(email.toLowerCase());
}

export function roleForEmail(email: string): "OWNER" | "MEMBER" {
  return AUTHORIZED_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase())?.role ?? "MEMBER";
}
