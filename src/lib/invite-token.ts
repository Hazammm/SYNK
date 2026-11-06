import { createHash, randomBytes } from "node:crypto";

export function createInviteToken() {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
