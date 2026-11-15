import { api, AppError } from "@/lib/errors";
import { readText } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { codeHostSchema, receiveWebhook } from "@/features/integrations/service";
type Context = { params: Promise<{ provider: string }> };

// Called by GitHub or Bitbucket when a pull request changes. There is no session; the delivery is signed with the repository's secret.
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const provider = codeHostSchema.safeParse((await context.params).provider.toUpperCase());
    if (!provider.success) throw new AppError(404, "Unknown code host.");
    rateLimit(`webhook:${request.headers.get("x-synk-client-ip") ?? "unknown"}`, 300);
    return receiveWebhook(provider.data, request.headers, await readText(request, 1_000_000));
  });
}
