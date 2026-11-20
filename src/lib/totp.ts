import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Time-based one-time passwords (RFC 6238): 6 digits, 30-second steps, SHA-1, as authenticator apps expect.
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, at = Date.now(), digits = DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / STEP_SECONDS)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(number).padStart(digits, "0");
}

// Accepts the current code and one step either side, for clocks that drift a little.
export function verifyTotp(secret: string, code: string, at = Date.now()) {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return false;
  return [-1, 0, 1].some(step => timingSafeEqual(Buffer.from(totpCode(secret, at + step * STEP_SECONDS * 1000)), Buffer.from(given)));
}

export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`Synk:${account}`)}?secret=${secret}&issuer=Synk&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

// Secrets are stored encrypted with a key derived from NEXTAUTH_SECRET, so a database copy alone can't make codes.
function key() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for two-factor sign-in.");
  return createHash("sha256").update(`synk-totp:${secret}`).digest();
}

export function sealSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString("base64url")).join(".");
}

export function openSecret(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// Recovery codes are random, so a plain SHA-256 is enough to store them.
export const hashRecoveryCode = (code: string) => createHash("sha256").update(code.toLowerCase().replace(/[\s-]/g, "")).digest("hex");
export const generateRecoveryCodes = (count = 8) =>
  Array.from({ length: count }, () => { const raw = randomBytes(5).toString("hex"); return `${raw.slice(0, 5)}-${raw.slice(5)}`; });
