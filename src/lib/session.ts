import { getServerSession } from "next-auth";
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
