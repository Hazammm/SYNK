/**
 * Password-reset email dispatcher.
 *
 * - If RESEND_API_KEY and EMAIL_FROM are set, the email is sent through the
 *   Resend HTTP API (no SDK dependency needed).
 * - Otherwise, in development, the reset link is printed to the server
 *   console so the developer can click it.
 * - In production without a provider, the send fails and the link is NEVER
 *   logged (it is a live credential). server.ts refuses to start in this state.
 */

const SEND_TIMEOUT_MS = 10_000;

export interface ResetEmail {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({ to, resetUrl }: ResetEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: "Reset your Synk password",
        text: `Someone asked to reset your Synk password.\n\nOpen this link within 15 minutes to choose a new one:\n${resetUrl}\n\nIf this wasn't you, ignore this email; your password will not change.`,
      }),
    });
    if (!response.ok) throw new Error(`Email provider responded ${response.status}`);
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("No email provider is configured (set RESEND_API_KEY and EMAIL_FROM).");
  }

  console.log(`\n[synk] 🔐 Password reset link for ${to} (dev mode, not emailed):\n  ${resetUrl}\n`);
}
