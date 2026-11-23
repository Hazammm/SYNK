import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { cancelReminder } from "@/features/reminders/service";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => cancelReminder((await authorizeWrite(request)).id, (await context.params).id));
}
