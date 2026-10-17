import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { removeMember } from "@/features/workspaces/service";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; userId: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const params = await context.params;
    return removeMember(user.id, params.id, params.userId);
  });
}
