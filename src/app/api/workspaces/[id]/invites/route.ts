import { createInvites, listInvites } from "@/features/workspaces/invites";
import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { requireRole } from "@/lib/require-role";
import { requireUser } from "@/lib/session";
import { inviteEmailsSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => {
    const { id } = await context.params;
    const { user } = await requireRole(id, "ADMIN");
    return { invites: await listInvites(user.id, id) };
  });
}

export async function POST(request: Request, context: Context) {
  return api(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    // Admins always; members too when the workspace lets everyone invite (checked in createInvites).
    const user = await requireUser();
    const input = inviteEmailsSchema.parse(await readJson(request));
    return createInvites(user.id, id, input);
  }, 201);
}
