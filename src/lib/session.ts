import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import { authOptions } from "./auth";
import { AppError } from "./errors";
import { connection } from "next/server";
import { redirect } from "next/navigation";

export async function requireUser() {
  // NextAuth performs cryptographic work; keep it out of Next.js partial prerendering.
  await connection();
  const session = await getServerSession(authOptions);
  if (!session?.user.id) throw new AppError(401, "Please sign in to continue.");
  return session.user;
}

export async function requirePageUser() {
  try { return await requireUser(); }
  catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    throw error;
  }
}

// The signed-in user plus the login record this browser is using.
export async function requireLoginSession() {
  const user = await requireUser();
  const jar = await cookies();
  const req = { cookies: Object.fromEntries(jar.getAll().map(cookie => [cookie.name, cookie.value])), headers: {} };
  const token = await getToken({ req: req as Parameters<typeof getToken>[0]["req"], secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sessionId || token.sub !== user.id) throw new AppError(401, "Please sign in to continue.");
  return { user, sessionId: token.sessionId };
}
