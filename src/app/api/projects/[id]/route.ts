import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { getProject } from "@/features/projects/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ project: await getProject((await requireUser()).id, (await context.params).id) }));
}
