import { requireUser } from "@/lib/session";
import { api, AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_ATTACHMENT_SIZE_BYTES, saveAttachment } from "@/lib/attachments";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    rateLimit(`upload:${user.id}`, 30);
    // Refuse oversized uploads before reading the body into memory.
    if (Number(request.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_SIZE_BYTES + 64 * 1024) throw new AppError(413, "File exceeds maximum size limit of 10MB.");
    const { id: workspaceId } = await context.params;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(400, "Missing or invalid file.");
    }

    const saved = await saveAttachment(user.id, workspaceId, file);
    return { attachment: saved };
  }, 201);
}

