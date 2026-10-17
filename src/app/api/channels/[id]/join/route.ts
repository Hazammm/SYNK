import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { joinChannel } from "@/features/chat/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    return joinChannel(user.id, (await context.params).id);
  });
}
