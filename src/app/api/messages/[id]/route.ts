import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { deleteMessage, editMessage } from "@/features/chat/service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await readJson(request);
    return { message: await editMessage(user.id, id, body) };
  });
}

export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await context.params;
    return deleteMessage(user.id, id);
  });
}

