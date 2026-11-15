import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { unlinkRepository } from "@/features/integrations/service";
type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  return api(async () => unlinkRepository((await authorizeWrite(request)).id, (await context.params).id));
}
