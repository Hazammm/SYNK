import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { readAttachment } from "@/lib/attachments";
import { HttpError } from "@/lib/client-http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { attachment, data } = await readAttachment(user.id, id);

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": attachment.size.toString(),
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Attachment not found";
    const status = error instanceof HttpError ? error.status : 404;
    return new NextResponse(message, { status });
  }
}

