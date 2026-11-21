import { connection } from "next/server";
import { api } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { readWrite } from "@/lib/write-request";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/features/workspaces/admin";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => ({ workspace: await getWorkspaceSettings((await requireUser()).id, (await context.params).id) }));
}

// Admins only. Body { name?, invitePolicy? }.
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { workspace: await updateWorkspaceSettings(user.id, (await context.params).id, body) };
  });
}
