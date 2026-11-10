import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { getTicket, updateTicket } from "@/features/tickets/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ ticket: await getTicket((await requireUser()).id, (await context.params).id) }));
}
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { ticket: await updateTicket(user.id, (await context.params).id, body) };
  });
}
