import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { createTicket, listTickets } from "@/features/tickets/service";

// GET /api/tickets?boardId=… (or projectId=…) with optional assigneeId, priority, columnId and sprintId filters.
export async function GET(request: Request) {
  return api(async () => ({ tickets: await listTickets((await requireUser()).id, Object.fromEntries(new URL(request.url).searchParams)) }));
}
export async function POST(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { ticket: await createTicket(user.id, body) };
  }, 201);
}
