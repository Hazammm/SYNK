import { api } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { requireLoginSession } from "@/lib/session";
import { getAccount, updateProfile } from "@/features/account/service";

export async function GET() {
  return api(async () => {
    const { user, sessionId } = await requireLoginSession();
    return { account: await getAccount(user.id, sessionId) };
  });
}
// Body { name } and/or { notifications: { assigned, comments, mentions } }.
export async function PATCH(request: Request) {
  return api(async () => {
    const { user } = await requireLoginSession();
    assertSameOrigin(request);
    return updateProfile(user.id, await readJson(request));
  });
}
