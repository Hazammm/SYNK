import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { registerSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    rateLimit(`register:${request.headers.get("x-synk-client-ip") ?? "unknown"}`, 20, 15 * 60_000);
    const { password, ...data } = registerSchema.parse(await readJson(request));
    const user = await db.user.create({ data: { ...data, passwordHash: await hash(password, 12) }, select: { id: true } });
    return { user };
  }, 201);
}
