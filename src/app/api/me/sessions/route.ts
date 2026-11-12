import { api } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { requireLoginSession } from "@/lib/session";
import { signOutOtherSessions } from "@/features/account/service";

// DELETE signs out every other browser and device; this one stays signed in.
export async function DELETE(request: Request) {
  return api(async () => {
    const { user, sessionId } = await requireLoginSession();
    assertSameOrigin(request);
    return signOutOtherSessions(user.id, sessionId);
  });
}
