import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { listMessages, sendMessage } from "@/features/chat/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return api(async () => listMessages((await requireUser()).id, (await context.params).id, Object.fromEntries(new URL(request.url).searchParams)));
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    rateLimit(`send:${user.id}`, 60);
    return { message: await sendMessage(user.id, (await context.params).id, await readJson(request)) };
  }, 201);
}
