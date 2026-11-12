import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { getOverview } from "@/features/overview/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ overview: await getOverview((await requireUser()).id, (await context.params).id) }));
}
