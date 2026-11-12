import { Suspense } from "react";
import SynkScreen from "@/components/SynkScreen";
import { listWorkspaces } from "@/features/workspaces/service";
import type { Selection } from "@/features/tickets/ui";
import { requireWorkspaceUser } from "@/lib/workspace-context";

type ScreenName = "overview" | "alerts" | "board" | "backlog" | "reports" | "docs" | "time";

export default function WorkspaceScreenPage({
  params,
  screen,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  screen: ScreenName;
  searchParams?: Promise<Selection>;
}) {
  return (
    <Suspense fallback={<div role="status" style={{ padding: 32 }}>Loading workspace page…</div>}>
      <WorkspaceScreenContent params={params} screen={screen} searchParams={searchParams} />
    </Suspense>
  );
}

async function WorkspaceScreenContent({
  params,
  screen,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  screen: ScreenName;
  searchParams?: Promise<Selection>;
}) {
  const { workspaceId } = await params;
  const user = await requireWorkspaceUser(workspaceId);
  return (
    <SynkScreen
      screen={screen}
      workspaceId={workspaceId}
      userId={user.id}
      userName={user.name ?? "Member"}
      userEmail={user.email ?? ""}
      role={user.role}
      initialWorkspaces={await listWorkspaces(user.id)}
      initialSelection={await searchParams ?? {}}
    />
  );
}
