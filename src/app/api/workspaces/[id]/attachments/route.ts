import { requireUser } from "@/lib/session";
import { api, AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http";
import { saveAttachment } from "@/lib/attachments";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
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

