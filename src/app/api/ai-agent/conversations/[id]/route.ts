import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { getConversation } from "@/features/agent/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ conversation: await getConversation((await requireUser()).id, (await context.params).id) }));
}
