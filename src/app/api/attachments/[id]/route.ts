import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { readAttachment } from "@/lib/attachments";

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
  } catch (error: any) {
    return new NextResponse(error?.message ?? "Attachment not found", {
      status: error?.status ?? 404,
    });
  }
}

