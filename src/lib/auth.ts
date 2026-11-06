import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "./db";
import { credentialsSchema } from "./validation";
import { rateLimit } from "./rate-limit";
import { realtime } from "./realtime";

const maxAge = 7 * 24 * 60 * 60;
const providers: NextAuthOptions["providers"] = [Credentials({
  name: "Email and password",
  credentials: { email: { type: "email" }, password: { type: "password" } },
  async authorize(input, request) {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) return null;
    const clientIp = request.headers?.["x-synk-client-ip"] ?? "unknown";
    rateLimit(`login:${parsed.data.email}:${clientIp}`, 10, 5 * 60_000);
    const user = await db.user.findFirst({ where: { email: { equals: parsed.data.email, mode: "insensitive" } } });
    // Use the same bcrypt cost for unknown accounts to avoid an easy timing oracle.
    const fallback = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5MR.PmTuYkSY7jLRPx3QIkggY7UjN0i";
    const valid = await compare(parsed.data.password, user?.passwordHash ?? fallback);
    if (!valid || !user?.passwordHash || !user.email) return null;
    const membership = await db.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { workspaceId: true },
    });
    if (!membership) return null;
    return { id: user.id, name: user.name, email: user.email, image: user.image };
  },
})];

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const login = await db.loginSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + maxAge * 1000) } });
        token.sub = user.id;
        token.sessionId = login.id;
      }
      if (token.sub) {
        const membership = await db.membership.findFirst({
          where: { userId: token.sub },
          orderBy: { createdAt: "asc" },
          select: { workspaceId: true, role: true },
        });
        token.workspaceId = membership?.workspaceId;
        token.role = membership?.role;
      }
      return token;
    },
    async session({ session, token }) {
      const login = token.sessionId ? await db.loginSession.findUnique({ where: { id: token.sessionId } }) : null;
      const active = login && login.userId === token.sub && login.expiresAt > new Date();
      session.user.id = active ? login.userId : "";
      session.user.workspaceId = active ? token.workspaceId ?? "" : "";
      session.user.role = active ? token.role ?? null : null;
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.sessionId) {
        await db.loginSession.deleteMany({ where: { id: token.sessionId } });
        realtime()?.disconnectSession(token.sessionId);
      }
    },
  },
};
