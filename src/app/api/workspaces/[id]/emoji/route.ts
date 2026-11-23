import { connection } from "next/server";
import { api, AppError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { authorizeWrite } from "@/lib/write-request";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_AVATAR_BYTES } from "@/features/account/avatar";
import { createEmoji, listEmoji } from "@/features/emoji/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  return api(async () => ({ emoji: await listEmoji((await requireUser()).id, (await context.params).id) }));
}

export async function POST(request: Request, context: Context) {
  return api(async () => {
    const user = await authorizeWrite(request);
    rateLimit(`emoji:${user.id}`, 20);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_AVATAR_BYTES + 64 * 1024) throw new AppError(413, "Choose an image up to 2 MB.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400, "Choose an image to upload.");
    return { emoji: await createEmoji(user.id, (await context.params).id, form.get("shortcode"), file) };
  }, 201);
}
