import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/errors";
import { readAvatar } from "@/features/account/avatar";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { bytes, type } = await readAvatar(user.id, (await context.params).id);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
