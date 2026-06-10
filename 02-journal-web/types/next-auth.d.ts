import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "OWNER" | "MEMBER";
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role?: "OWNER" | "MEMBER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "OWNER" | "MEMBER";
  }
}
