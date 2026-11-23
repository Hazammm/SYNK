import type { Prisma } from "@prisma/client";
import { AppError } from "../../lib/errors";
import { assertEmailAllowed } from "../../lib/join-policy";

export async function assertCanJoinWorkspace(
  database: Prisma.TransactionClient | typeof import("../../lib/db").db,
  workspaceId: string,
  email: string | null,
  viaGoogle: boolean,
) {
  const workspace = await database.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { allowedEmailDomains: true, requireGoogleSignIn: true },
  });
  if (email) assertEmailAllowed(email, workspace.allowedEmailDomains);
  if (workspace.requireGoogleSignIn && !viaGoogle) {
    throw new AppError(403, "This workspace requires Google sign-in. Use Continue with Google.");
  }
  return workspace;
}
