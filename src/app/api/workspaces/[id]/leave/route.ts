import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { leaveWorkspace } from "@/features/account/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    return leaveWorkspace(user.id, (await context.params).id);
  });
}
