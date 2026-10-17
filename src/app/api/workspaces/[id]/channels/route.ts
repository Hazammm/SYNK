import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { createChannel, listChannels } from "@/features/chat/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ channels: await listChannels((await requireUser()).id, (await context.params).id) }));
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    return { channel: await createChannel(user.id, (await context.params).id, await readJson(request)) };
  }, 201);
}
