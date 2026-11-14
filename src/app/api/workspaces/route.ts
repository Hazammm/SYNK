import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { authOptions } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { api, AppError } from "@/lib/errors";
import { assertSameOrigin, readJson } from "@/lib/http";
import { createWorkspaceForAdmin, createWorkspaceForGoogleUser, createWorkspaceForUser } from "@/features/workspaces/onboarding";
import { createWorkspace, listWorkspaces } from "@/features/workspaces/service";
import { rateLimit } from "@/lib/rate-limit";
import { readGoogleProfileCookie, GOOGLE_PROFILE_COOKIE } from "@/lib/google-profile-cookie";
import { createWorkspaceGoogleSchema, createWorkspaceSchema } from "@/lib/validation";

export async function GET() {
  await connection();
  return api(async () => ({ workspaces: await listWorkspaces((await requireUser()).id) }));
}

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const body = await readJson(request);
    const fields: Record<string, unknown> = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    const hasAccountDetails = "adminName" in fields || "email" in fields || "password" in fields;

    // A signed-in user adding another workspace (the setup wizard or the quick form in chat).
    const session = hasAccountDetails ? null : await getServerSession(authOptions);
    if (session?.user.id) {
      rateLimit(`create-workspace-user:${session.user.id}`, 10, 15 * 60_000);
      if ("name" in fields) return { workspace: await createWorkspace(session.user.id, body) };
      return createWorkspaceForUser(session.user.id, body);
    }

    const googleProfile = hasAccountDetails ? null : await readGoogleProfileCookie();
    if (!hasAccountDetails && !googleProfile) {
      throw new AppError(401, "Your Google sign-up session expired. Please sign in with Google again.");
    }

    const validBody = googleProfile
      ? createWorkspaceGoogleSchema.safeParse(body).success
      : createWorkspaceSchema.safeParse(body).success;
    if (validBody) {
      const clientIp = request.headers.get("x-synk-client-ip") ?? "unknown";
      rateLimit(`create-workspace-valid-ip:${clientIp}`, 20, 15 * 60_000);
      const submittedEmail = googleProfile
        ? googleProfile.email
        : typeof fields.email === "string" ? fields.email.trim().toLowerCase() : undefined;
      if (submittedEmail) rateLimit(`create-workspace-valid-email:${submittedEmail}`, 5, 15 * 60_000);
    }

    if (googleProfile) {
      const result = await createWorkspaceForGoogleUser(googleProfile, body);
      (await cookies()).delete(GOOGLE_PROFILE_COOKIE); // the pending Google profile is used up
      return result;
    }

    return createWorkspaceForAdmin(body);
  }, 201);
}
