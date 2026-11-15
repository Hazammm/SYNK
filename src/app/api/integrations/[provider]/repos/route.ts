import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { listRemoteRepositories } from "@/features/integrations/service";
type Context = { params: Promise<{ provider: string }> };

// The signed-in person's repositories on GitHub or Bitbucket, to pick one to link.
export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => {
    const user = await requireUser();
    rateLimit(`code-host-read:${user.id}`, 30);
    return { repositories: await listRemoteRepositories(user.id, (await context.params).provider.toUpperCase()) };
  });
}
