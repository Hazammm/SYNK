import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { deleteTimeEntry } from "@/features/time/service";
type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  return api(async () => deleteTimeEntry((await authorizeWrite(request)).id, (await context.params).id));
}
