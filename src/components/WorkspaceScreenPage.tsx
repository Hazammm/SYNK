import { Suspense } from "react";
import { PageLoading } from "@/components/Status";
import SynkScreen, { type ScreenName } from "@/components/SynkScreen";
import { listWorkspaces } from "@/features/workspaces/service";
import type { Selection } from "@/features/tickets/ui";
import { requireWorkspaceUser } from "@/lib/workspace-context";

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
    <Suspense fallback={<PageLoading label="Loading workspace page…" />}>
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
      initialWorkspaces={await listWorkspaces(user.id)}
      initialSelection={await searchParams ?? {}}
    />
  );
}
