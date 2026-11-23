import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { votePoll } from "@/features/polls/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { poll: await votePoll(user.id, (await context.params).id, body) };
  });
}
