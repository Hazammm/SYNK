import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { getDoc } from "@/features/docs/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ doc: await getDoc((await requireUser()).id, (await context.params).id) }));
}
