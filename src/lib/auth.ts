import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { Bitbucket } from "./bitbucket-provider";
import { compare } from "bcryptjs";
import { db } from "./db";
import { credentialsSchema } from "./validation";
import { rateLimit } from "./rate-limit";
import { realtime } from "./realtime";

const maxAge = 7 * 24 * 60 * 60;
const providers: NextAuthOptions["providers"] = [Credentials({
  name: "Email and password",
  credentials: { email: { type: "email" }, password: { type: "password" } },
  async authorize(input) {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) return null;
    rateLimit(`login:${parsed.data.email}`, 10, 5 * 60_000);
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    // Use the same bcrypt cost for unknown accounts to avoid an easy timing oracle.
    const fallback = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5MR.PmTuYkSY7jLRPx3QIkggY7UjN0i";
    const valid = await compare(parsed.data.password, user?.passwordHash ?? fallback);
    if (!valid || !user?.passwordHash) return null;
    return { id: user.id, name: user.name, email: user.email, image: user.image };
  },
})];
if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) providers.push(GitHub({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET }));
if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) providers.push(Google({ clientId: process.env.GOOGLE_ID, clientSecret: process.env.GOOGLE_SECRET }));
if (process.env.BITBUCKET_ID && process.env.BITBUCKET_SECRET) providers.push(Bitbucket({ clientId: process.env.BITBUCKET_ID, clientSecret: process.env.BITBUCKET_SECRET }));

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
      return token;
    },
    async session({ session, token }) {
      const login = token.sessionId ? await db.loginSession.findUnique({ where: { id: token.sessionId } }) : null;
      session.user.id = login && login.userId === token.sub && login.expiresAt > new Date() ? login.userId : "";
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
