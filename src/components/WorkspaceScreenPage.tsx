import { Suspense } from "react";
import SynkScreen from "@/components/SynkScreen";

type ScreenName = "overview" | "alerts" | "board" | "backlog" | "reports" | "docs" | "time";

export default function WorkspaceScreenPage({
  params,
  screen,
}: {
  params: Promise<{ workspaceId: string }>;
  screen: ScreenName;
}) {
  return (
    <Suspense fallback={<div role="status" style={{ padding: 32 }}>Loading workspace page…</div>}>
      <WorkspaceScreenContent params={params} screen={screen} />
    </Suspense>
  );
}

async function WorkspaceScreenContent({
  params,
  screen,
}: {
  params: Promise<{ workspaceId: string }>;
  screen: ScreenName;
}) {
  const { workspaceId } = await params;
  return <SynkScreen screen={screen} workspaceId={workspaceId} />;
}
