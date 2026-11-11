import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceScreenPage params={params} screen="board" />;
}
