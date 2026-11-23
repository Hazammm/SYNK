import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { deleteWebhook } from "@/features/apps/service";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; webhookId: string }> }) {
  return api(async () => {
    const user = await authorizeWrite(request);
    const { id, webhookId } = await context.params;
    return deleteWebhook(user.id, id, webhookId);
  });
}
