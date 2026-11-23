import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { cancelScheduled } from "@/features/schedule/service";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => cancelScheduled((await authorizeWrite(request)).id, (await context.params).id));
}
