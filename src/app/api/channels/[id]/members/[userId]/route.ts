import { api } from "@/lib/errors";
import { authorizeWrite } from "@/lib/write-request";
import { removeChannelMember } from "@/features/chat/manage";
type Context = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const { id, userId } = await context.params;
    return removeChannelMember((await authorizeWrite(request)).id, id, userId);
  });
}
