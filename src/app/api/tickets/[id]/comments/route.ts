import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { addComment } from "@/features/tickets/service";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { comment: await addComment(user.id, (await context.params).id, body) };
  }, 201);
}
