import { connection } from "next/server";
import { api, errorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { authorizeWrite } from "@/lib/write-request";
import { readEmoji, removeEmoji } from "@/features/emoji/service";

type Context = { params: Promise<{ id: string; shortcode: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  try {
    const user = await requireUser();
    const { id, shortcode } = await context.params;
    const { bytes, type } = await readEmoji(user.id, id, shortcode);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const user = await authorizeWrite(request);
    const { id, shortcode } = await context.params;
    return removeEmoji(user.id, id, shortcode);
  });
}
