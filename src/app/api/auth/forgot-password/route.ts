import { randomBytes, createHash } from "crypto";
import { hash as bcryptHash } from "bcryptjs";
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

    if (user && user.passwordHash) {
      // Delete any previous unused tokens for this user
      await db.passwordResetToken.deleteMany({ where: { userId: user.id } });

      // Generate a cryptographically secure random token
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
        },
      });

      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

      await sendPasswordResetEmail({ to: email, resetUrl });
    } else {
      // Anti-enumeration: spend roughly the same time as the real path
      // by doing a dummy bcrypt hash, preventing timing-based email discovery.
      await bcryptHash("dummy-timing-equalization", 12);
    }

    // Always return the same generic message regardless of whether the user exists
    return { message: "If an account exists with this email, a reset link has been sent." };
  });
}

