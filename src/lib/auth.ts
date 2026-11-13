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
const LOGIN_WINDOW_MS = 5 * 60_000;

/**
 * Limits password guesses per client, so one client can't lock an account for
 * everyone else. The much higher per-account limit slows guessing spread across
 * many addresses, and is checked second so blocked clients don't count towards it.
 */
export function limitLogin(email: string, clientIp: string) {
  rateLimit(`login:${clientIp}:${email}`, 10, LOGIN_WINDOW_MS);
  rateLimit(`login:${email}`, 100, LOGIN_WINDOW_MS);
}

/**
 * Creates the login record for a verified password, unless that password was
 * replaced during the slow bcrypt check. The shared row lock orders this against
 * a reset: either the reset sees this login and revokes it, or this sees the new
 * hash and refuses.
 */
export async function createPasswordLogin(userId: string, verifiedHash: string) {
  return db.$transaction(async tx => {
    const [current] = await tx.$queryRaw<{ passwordHash: string | null }[]>`SELECT "passwordHash" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
    if (current?.passwordHash !== verifiedHash) return null;
    const login = await tx.loginSession.create({ data: { userId, expiresAt: new Date(Date.now() + maxAge * 1000) } });
    return login.id;
  });
}

const providers: NextAuthOptions["providers"] = [Credentials({
  name: "Email and password",
  credentials: { email: { type: "email" }, password: { type: "password" } },
  async authorize(input, request) {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) return null;
    limitLogin(parsed.data.email, request?.headers?.["x-synk-client-ip"] ?? "unknown");
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    // Use the same bcrypt cost for unknown accounts to avoid an easy timing oracle.
    const fallback = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5MR.PmTuYkSY7jLRPx3QIkggY7UjN0i";
    const valid = await compare(parsed.data.password, user?.passwordHash ?? fallback);
    if (!valid || !user?.passwordHash) return null;
    const loginSessionId = await createPasswordLogin(user.id, user.passwordHash);
    if (!loginSessionId) return null;
    return { id: user.id, name: user.name, email: user.email, image: user.image, loginSessionId };
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
        // Password logins already created theirs in authorize; OAuth logins haven't.
        token.sessionId = user.loginSessionId ?? (await db.loginSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + maxAge * 1000) } })).id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      const login = token.sessionId ? await db.loginSession.findUnique({ where: { id: token.sessionId }, include: { user: { select: { name: true, email: true } } } }) : null;
      const valid = Boolean(login && login.userId === token.sub && login.expiresAt > new Date());
      session.user.id = valid ? login!.userId : "";
      // Read from the database, so a renamed account shows its new name without signing in again.
      if (valid) { session.user.name = login!.user.name; session.user.email = login!.user.email; }
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
