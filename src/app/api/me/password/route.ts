import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { requireLoginSession } from "@/lib/session";
import { changePassword } from "@/features/account/service";

export async function POST(request: Request) {
  return api(async () => {
    const { user, sessionId } = await requireLoginSession();
    assertSameOrigin(request);
    return changePassword(user.id, sessionId, await readJson(request));
  });
}
