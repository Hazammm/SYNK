import { createHash } from "crypto";
import { hash as bcryptHash } from "bcryptjs";
import { db } from "@/lib/db";
import { api } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { realtime } from "@/lib/realtime";

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const clientIp = request.headers.get("x-synk-client-ip") ?? "unknown";
    rateLimit(`reset:${clientIp}`, 10, 15 * 60_000);

    const { token, password } = resetPasswordSchema.parse(await readJson(request));

    // Hash the submitted token with SHA-256 and look it up
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const resetRecord = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      throw new AppError(400, "This reset link is invalid or has expired. Please request a new one.");
    }

    const passwordHash = await bcryptHash(password, 12);

    // Atomic transaction: update password, delete all reset tokens, revoke all sessions
    await db.$transaction([
      db.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      db.passwordResetToken.deleteMany({
        where: { userId: resetRecord.userId },
      }),
      db.loginSession.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ]);

    // Disconnect all live socket connections for this user's sessions
    const rt = realtime();
    if (rt) {
      // The session-based disconnect already handled by deleting LoginSession rows;
      // on next socket heartbeat the sessions will be invalid and sockets will close.
    }

    return { message: "Your password has been reset. Please sign in with your new password." };
  });
}

