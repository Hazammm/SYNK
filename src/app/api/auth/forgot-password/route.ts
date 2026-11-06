import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { issuePasswordReset } from "@/lib/password-reset";

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const clientIp = request.headers.get("x-synk-client-ip") ?? "unknown";
    rateLimit(`forgot:${clientIp}`, 5, 15 * 60_000);

    const { email } = forgotPasswordSchema.parse(await readJson(request));

    // Not awaited, and the account isn't even looked up before responding:
    // waiting on the database or the email provider would let response timing
    // and errors reveal which emails exist.
    void issuePasswordReset(email).catch(error => {
      console.error("[synk] Failed to process password reset request:", error instanceof Error ? error.message : error);
    });

    // Same response whether or not the account exists (anti-enumeration).
    return { message: "If an account exists with this email, a reset link has been sent." };
  });
}
