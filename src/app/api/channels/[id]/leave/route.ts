import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { leaveChannel } from "@/features/chat/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await context.params;
    return leaveChannel(user.id, id);
  });
}

