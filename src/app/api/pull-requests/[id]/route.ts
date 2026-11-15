import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { unlinkPullRequest } from "@/features/integrations/service";
type Context = { params: Promise<{ id: string }> };

// Detaches a pull request from its ticket. The pull request itself is untouched.
export async function DELETE(request: Request, context: Context) {
  return api(async () => unlinkPullRequest((await authorizeWrite(request)).id, (await context.params).id));
}
