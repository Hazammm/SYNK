import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { sendPasswordResetEmail } from "./mailer";

const TOKEN_EXPIRY_MS = 15 * 60 * 1000;
// At most one email per account in this window. Requests inside it are ignored
// rather than rejected, so a third party can't flood or lock out a user.
export const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Issues a reset link if the account can use one. Earlier unexpired links stay
 * valid until a reset succeeds, so an unsolicited request can't cancel a link
 * the user is about to open and a failed send can't leave them with none.
 */
export async function issuePasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });

  // OAuth-only accounts (no passwordHash) never get a token, so this flow
  // can't be used to attach a password to them.
  if (!user?.passwordHash) return;

  // Only the SHA-256 hash is stored; the raw token exists only in the link.
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();

  // Locking the user row serializes concurrent requests, so only one can pass
  // the cooldown check. The reset route takes this lock first too.
  const issued = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, expiresAt: { lte: now } } });
    const recent = await tx.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) return false;
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, createdAt: now, expiresAt: new Date(now.getTime() + TOKEN_EXPIRY_MS) } });
    return true;
  });
  if (!issued) return;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  try {
    await sendPasswordResetEmail({ email, resetUrl: `${baseUrl}/reset-password?token=${rawToken}` });
  } catch (error) {
    // Nobody received this link, so don't let it hold the cooldown.
    await db.passwordResetToken.deleteMany({ where: { tokenHash } });
    throw error;
  }
}
