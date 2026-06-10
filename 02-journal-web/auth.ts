import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isAuthorizedEmail } from "@/lib/authorized-users";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/trades",
  "/tasks",
  "/notes",
  "/news",
  "/vault",
  "/settings",
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        // Fase 2.3 — Defensa en profundidad: incluso si existiera una cuenta
        // fuera de la whitelist, no puede iniciar sesión.
        if (!isAuthorizedEmail(email)) {
          console.warn(`[AUTH] Login no autorizado rechazado: ${email}`);
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: "OWNER" | "MEMBER" }).role ?? "MEMBER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        (session.user as { id?: string }).id = String(token.uid);
        (session.user as { role?: "OWNER" | "MEMBER" }).role =
          (token.role as "OWNER" | "MEMBER") ?? "MEMBER";
      }
      return session;
    },
    authorized({ request, auth: session }) {
      const { pathname } = request.nextUrl;
      const isProtected = PROTECTED_PREFIXES.some((p) =>
        pathname === p || pathname.startsWith(p + "/"),
      );
      if (!isProtected) return true;
      return !!session;
    },
  },
});
