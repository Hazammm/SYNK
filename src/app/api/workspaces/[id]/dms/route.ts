import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { createDirectMessage } from "@/features/chat/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await readJson(request);
    return { channel: await createDirectMessage(user.id, id, body) };
  }, 201);
}

