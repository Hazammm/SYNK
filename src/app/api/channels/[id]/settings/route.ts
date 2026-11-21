import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { updateChannelSettings } from "@/features/chat/manage";
type Context = { params: Promise<{ id: string }> };

// Body { name?, archived?, private?: true, postingPolicy? }. The channel creator or a workspace admin.
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { channel: await updateChannelSettings(user.id, (await context.params).id, body) };
  });
}
