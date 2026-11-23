import { api, AppError } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { postWebhook } from "@/features/apps/service";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return api(async () => {
    const { token } = await context.params;
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new AppError(404, "Webhook not found.");
    const ip = request.headers.get("x-synk-client-ip") ?? "unknown";
    rateLimit(`hook:${token}`, 30);
    rateLimit(`hook-ip:${ip}`, 60);
    return postWebhook(token, await readJson(request));
  }, 201);
}
