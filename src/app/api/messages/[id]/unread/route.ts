import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { markUnread } from "@/features/chat/manage";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return api(async () => markUnread((await authorizeWrite(request)).id, (await context.params).id));
}
