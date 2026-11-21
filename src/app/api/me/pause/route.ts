import { api } from "@/lib/errors";
import { readWrite } from "@/lib/write-request";
import { pauseNotifications } from "@/features/account/service";

// Body { until } pauses notifications until that time; { until: null } resumes them.
export async function PUT(request: Request) {
  return api(async () => {
    const { user, body } = await readWrite(request);
    return pauseNotifications(user.id, body);
  });
}
