import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { startTimer } from "@/features/time/service";

// Body { ticketId, note? }. A timer that is already running is stopped first.
export async function POST(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return startTimer(user.id, body);
  }, 201);
}
