import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { scheduleMessage } from "@/features/schedule/service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { scheduled: await scheduleMessage(user.id, (await context.params).id, body) };
  }, 201);
}
