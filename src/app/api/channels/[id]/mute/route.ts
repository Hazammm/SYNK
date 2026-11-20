import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { setChannelMuted } from "@/features/chat/manage";
type Context = { params: Promise<{ id: string }> };

// Body { muted: boolean }.
export async function PUT(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return setChannelMuted(user.id, (await context.params).id, (body as { muted?: unknown } | null)?.muted);
  });
}
