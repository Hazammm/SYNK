import { requireUser } from "@/lib/session";
import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { countUnread, listNotifications, markNotificationsRead } from "@/features/notifications/service";

// GET /api/notifications lists alerts; ?summary=1 returns only the unread count for the navigation badge.
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireUser();
    return new URL(request.url).searchParams.has("summary") ? { unread: await countUnread(user.id) } : listNotifications(user.id);
  });
}
// Body { ids: [...] } marks those as read; an empty object marks everything.
export async function PATCH(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return markNotificationsRead(user.id, body);
  });
}
