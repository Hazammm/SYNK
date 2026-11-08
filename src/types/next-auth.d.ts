import type { DefaultSession } from "next-auth";
import type { WorkspaceRole } from "@prisma/client";
declare module "next-auth" {
  interface Session { user: { id: string; workspaceId: string; role: WorkspaceRole | null } & DefaultSession["user"]; }
  interface User { loginSessionId?: string; }
}
declare module "next-auth/jwt" {
  interface JWT { sessionId?: string; workspaceId?: string; role?: WorkspaceRole; }
}
