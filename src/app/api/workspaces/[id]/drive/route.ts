import { requireUser } from "@/lib/session";
import { api, AppError } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { requireWorkspace } from "@/lib/permissions";
import { driveImportSchema } from "@/lib/validation";
import { googleDriveConfigured, importDriveFile, listDriveFiles } from "@/lib/google-drive";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspace(user.id, id);
    if (!googleDriveConfigured()) {
      return { available: false, connected: false, files: [] };
    }

    const search = new URL(request.url).searchParams.get("q") ?? "";
    if (search.length > 80) throw new AppError(400, "Search is too long.");
    try {
      const files = await listDriveFiles(user.id, search);
      return { available: true, connected: true, files };
    } catch (error) {
      if (error instanceof AppError && error.status === 409) {
        return { available: true, connected: false, files: [] };
      }
      throw error;
    }
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await context.params;
    await requireWorkspace(user.id, id);
    const { fileId } = driveImportSchema.parse(await readJson(request));
    const attachment = await importDriveFile(user.id, id, fileId);
    return { attachment };
  }, 201);
}
