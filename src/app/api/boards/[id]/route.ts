import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { updateBoard } from "@/features/tickets/service";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { board: await updateBoard(user.id, (await context.params).id, body) };
  });
}
