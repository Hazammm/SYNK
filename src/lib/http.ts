import { AppError } from "./errors";

export function assertSameOrigin(request: Request) {
  const allowed = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000").origin;
  if (request.headers.get("origin") !== allowed) throw new AppError(403, "Request origin is not allowed.");
}

// The body as text, refused once it grows past maxBytes.
export async function readText(request: Request, maxBytes: number) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Send JSON content.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new AppError(413, "Request is too large."); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export async function readJson(request: Request, maxBytes = 20_000) {
  const text = await readText(request, maxBytes);
  try { return JSON.parse(text) as unknown; } catch { throw new AppError(400, "Invalid JSON body."); }
}
