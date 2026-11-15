import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { linkPullRequest, listPullRequests } from "@/features/integrations/service";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => listPullRequests((await requireUser()).id, (await context.params).id));
}
// Body { url } attaches a pull request from a repository linked to the ticket's project.
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return { pullRequest: await linkPullRequest(user.id, (await context.params).id, body) };
  }, 201);
}
