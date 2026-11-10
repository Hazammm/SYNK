import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { createProject, listProjects } from "@/features/projects/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return api(async () => ({ projects: await listProjects((await requireUser()).id, (await context.params).id) }));
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { project: await createProject(user.id, (await context.params).id, body) };
  }, 201);
}
