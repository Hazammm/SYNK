import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { listProjectAccess, setProjectAccess } from "@/features/projects/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ access: await listProjectAccess((await requireUser()).id, (await context.params).id) }));
}
export async function PUT(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return setProjectAccess(user.id, (await context.params).id, body);
  });
}
