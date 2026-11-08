import { createHash } from "crypto";
import { hash as bcryptHash } from "bcryptjs";
import { db } from "@/lib/db";
import { AppError, api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { realtime } from "@/lib/realtime";

const INVALID_LINK = "This reset link is invalid or has expired. Please request a new one.";

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const clientIp = request.headers.get("x-synk-client-ip") ?? "unknown";
    rateLimit(`reset:${clientIp}`, 10, 15 * 60_000);

    const { token, password } = resetPasswordSchema.parse(await readJson(request));
    const tokenHash = createHash("sha256").update(token).digest("hex");

    // Cheap pre-check so an invalid link doesn't cost a bcrypt hash.
    const resetRecord = await db.passwordResetToken.findUnique({ where: { tokenHash }, select: { userId: true, expiresAt: true } });
    if (!resetRecord || resetRecord.expiresAt <= new Date()) throw new AppError(400, INVALID_LINK);

    const passwordHash = await bcryptHash(password, 12);

    const revokedSessionIds = await db.$transaction(async tx => {
      // Lock the user first, matching the forgot-password and login transactions:
      // this avoids deadlocks, and a login can't commit between the password
      // change and the session revocation below.
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${resetRecord.userId} FOR UPDATE`;

      // Consume the token atomically: only one concurrent request can delete it.
      const consumed = await tx.passwordResetToken.deleteMany({ where: { tokenHash, expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) throw new AppError(400, INVALID_LINK);

      await tx.user.update({ where: { id: resetRecord.userId }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: resetRecord.userId } });

      // Revoke every existing login so a stolen session can't outlive the reset.
      const sessions = await tx.loginSession.findMany({ where: { userId: resetRecord.userId }, select: { id: true } });
      await tx.loginSession.deleteMany({ where: { userId: resetRecord.userId } });
      return sessions.map(session => session.id);
    });

    // Drop live sockets now rather than waiting for their next permission re-check.
    const rt = realtime();
    for (const sessionId of revokedSessionIds) rt?.disconnectSession(sessionId);

    return { message: "Your password has been reset. Please sign in with your new password." };
  });
}
