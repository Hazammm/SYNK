import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { updateSprint } from "@/features/tickets/service";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { sprint: await updateSprint(user.id, (await context.params).id, body) };
  });
}
