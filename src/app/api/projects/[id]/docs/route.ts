import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { listDocs } from "@/features/docs/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ docs: await listDocs((await requireUser()).id, (await context.params).id) }));
}
