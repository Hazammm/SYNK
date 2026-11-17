import { z } from "zod";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { getChannel, updateChannelTopic } from "@/features/chat/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    return { channel: await getChannel(user.id, id) };
  });
}

const updateSchema = z.object({
  topic: z.string().max(250).optional(),
}).strict();

export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = updateSchema.parse(await readJson(request));
    if (body.topic !== undefined) {
      return { channel: await updateChannelTopic(user.id, id, body.topic) };
    }
    return { channel: await getChannel(user.id, id) };
  });
}

