import { resendInvite, revokeInvite } from "@/features/workspaces/invites";
import { api } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/require-role";
import { idSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string; inviteId: string }> };

export async function POST(request: Request, context: Context) {
  return api(async () => {
    assertSameOrigin(request);
    const { id, inviteId: rawInviteId } = await context.params;
    const inviteId = idSchema.parse(rawInviteId);
    const { user } = await requireRole(id, "ADMIN");
    return resendInvite(user.id, id, inviteId);
  });
}

export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    assertSameOrigin(request);
    const { id, inviteId: rawInviteId } = await context.params;
    const inviteId = idSchema.parse(rawInviteId);
    const { user } = await requireRole(id, "ADMIN");
    return revokeInvite(user.id, id, inviteId);
  });
}
