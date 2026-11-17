import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/errors";
import { attachmentHeaders, readAttachment } from "@/lib/attachments";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { attachment, data } = await readAttachment(user.id, (await context.params).id);
    return new Response(new Uint8Array(data), { headers: attachmentHeaders(attachment) });
  } catch (error) {
    return errorResponse(error);
  }
}
