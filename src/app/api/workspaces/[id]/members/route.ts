import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { listMembers } from "@/features/workspaces/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ members: await listMembers((await requireUser()).id, (await context.params).id) }));
}
