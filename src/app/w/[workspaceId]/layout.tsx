import { Suspense, type ReactNode } from "react";
import SynkShell from "@/components/SynkShell";
import { PageLoading } from "@/components/Status";
import { requireWorkspaceUser } from "@/lib/workspace-context";
import { listWorkspaces } from "@/features/workspaces/service";

export const instant = false;

export default async function WorkspaceRouteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  const workspaces = await listWorkspaces(user.id);

  return (
    <Suspense fallback={<PageLoading as="main" full label="Loading your workspace…" />}>
      <SynkShell
        userName={user.name ?? "Member"}
        workspaceId={workspaceId}
        workspaceName={user.workspaceName}
        role={user.role}
        workspaces={workspaces}
      >
        {children}
      </SynkShell>
    </Suspense>
  );
}

