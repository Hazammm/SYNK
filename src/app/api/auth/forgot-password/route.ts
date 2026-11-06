import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const clientIp = request.headers.get("x-synk-client-ip") ?? "unknown";
    rateLimit(`forgot:${clientIp}`, 5, 15 * 60_000);

    const { email } = forgotPasswordSchema.parse(await readJson(request));
    rateLimit(`forgot:${email}`, 3, 15 * 60_000);

    const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });

    // OAuth-only accounts (no passwordHash) never get a token, so this flow
    // can't be used to attach a password to them.
    if (user?.passwordHash) {
      // Only the SHA-256 hash is stored; the raw token exists only in the link.
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      // Replace any earlier link so only the newest one works. Locking the user
      // row serializes concurrent requests, so two can't both leave a token behind.
      await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS) } });
      });

      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

      // Not awaited: the response must not wait on (or reveal failures of) the
      // email provider, otherwise timing and errors would expose which emails exist.
      void sendPasswordResetEmail({ to: email, resetUrl }).catch(error => {
        console.error("[synk] Failed to send password reset email:", error instanceof Error ? error.message : error);
      });
    }

    // Same response whether or not the account exists (anti-enumeration).
    return { message: "If an account exists with this email, a reset link has been sent." };
  });
}
