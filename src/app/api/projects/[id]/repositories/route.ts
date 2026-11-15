import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { linkRepository, listRepositories } from "@/features/integrations/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => ({ repositories: await listRepositories((await requireUser()).id, (await context.params).id) }));
}
// Body { provider, fullName } links a repository to the project. Workspace admins only.
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { repository: await linkRepository(user.id, (await context.params).id, body) };
  }, 201);
}
