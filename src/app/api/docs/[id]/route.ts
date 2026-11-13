import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { authorizeWrite, readWrite } from "@/lib/write-request";
import { deleteDoc, getDoc, updateDoc } from "@/features/docs/service";
type Context = { params: Promise<{ id: string }> };
// Room for a full page: 100,000 characters can take up to about 400 KB as UTF-8.
const MAX_BODY = 420_000;

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ doc: await getDoc((await requireUser()).id, (await context.params).id) }));
}
// Body { version, title?, content?, parentId? }; a stale version is refused with 409.
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request, MAX_BODY);
    return { doc: await updateDoc(user.id, (await context.params).id, body) };
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => deleteDoc((await authorizeWrite(request)).id, (await context.params).id));
}
