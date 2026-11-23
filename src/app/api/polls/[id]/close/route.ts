import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { closePoll } from "@/features/polls/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => ({ poll: await closePoll((await authorizeWrite(request)).id, (await context.params).id) }));
}
