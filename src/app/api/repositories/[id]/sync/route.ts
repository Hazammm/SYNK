import { api } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { authorizeWrite } from "@/lib/write-request";
import { syncRepository } from "@/features/integrations/service";
type Context = { params: Promise<{ id: string }> };

// Reads the repository's recent pull requests from the code host and attaches them to the tickets they name.
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const user = await authorizeWrite(request);
    rateLimit(`code-host-read:${user.id}`, 30);
    return syncRepository(user.id, (await context.params).id);
  });
}
