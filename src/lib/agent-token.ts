import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "./errors";

// The agent service acts for one person at a time. Each chat request gets a short-lived
// token naming that person and workspace; the agent hands it back when it calls a tool.
// Only Next.js can sign one, so the agent can never act as somebody else.
export const AGENT_TOKEN_TTL_MS = 5 * 60_000;
export type AgentClaims = { userId: string; workspaceId: string; conversationId: string; expiresAt: number };

function sign(payload: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set.");
  // The prefix keeps these signatures from ever being valid for another purpose.
  return createHmac("sha256", secret).update(`synk-agent-token.${payload}`).digest("base64url");
}

export function mintAgentToken(claims: Omit<AgentClaims, "expiresAt">, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...claims, expiresAt: now + AGENT_TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAgentToken(token: string, now = Date.now()): AgentClaims {
  const invalid = new AppError(401, "The agent token is invalid or has expired.");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) throw invalid;
  const expected = Buffer.from(sign(payload)), given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid;
  let claims: Partial<AgentClaims>;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw invalid; }
  const { userId, workspaceId, conversationId, expiresAt } = claims;
  if (typeof userId !== "string" || typeof workspaceId !== "string" || typeof conversationId !== "string" || typeof expiresAt !== "number" || expiresAt <= now) throw invalid;
  return { userId, workspaceId, conversationId, expiresAt };
}
