import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { toggleSaved } from "@/features/chat/manage";
type Context = { params: Promise<{ id: string }> };

// Saves the message for later, or removes it from saved items if it was saved.
export async function POST(request: Request, context: Context) {
  return api(async () => toggleSaved((await authorizeWrite(request)).id, (await context.params).id));
}
