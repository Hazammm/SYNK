import { api } from "@/lib/errors";
import { readWrite, authorizeWrite } from "@/lib/write-request";
import { deleteGroup, updateGroup } from "@/features/groups/service";

type Context = { params: Promise<{ id: string; groupId: string }> };

export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    const { id, groupId } = await context.params;
    return { group: await updateGroup(user.id, id, groupId, body) };
  });
}

export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const user = await authorizeWrite(request);
    const { id, groupId } = await context.params;
    return deleteGroup(user.id, id, groupId);
  });
}
