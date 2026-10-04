import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface User {
    globalRole?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      globalRole?: string;
    } & Record<string, unknown>;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Sessions JWT autosuffisantes (self-hosted, aucune table de session).
  session: { strategy: "jwt" },
  // Secret explicite : sans AUTH_SECRET en production, Auth.js répond
  // « There was a problem with the server configuration » (erreur Configuration).
  secret: process.env.AUTH_SECRET,
  // Requis derrière un proxy TLS (Vercel, Docker) : sinon « UntrustedHost ».
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email / mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          globalRole: user.globalRole,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        (token as unknown as Record<string, unknown>).globalRole = (
          user as unknown as { globalRole?: string }
        ).globalRole;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const t = token as unknown as Record<string, unknown>;
        session.user.id = String(t["id"] ?? token.sub ?? "");
        session.user.globalRole = t["globalRole"] as string | undefined;
      }
      return session;
    },
  },
});
