import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceBacklogPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceScreenPage params={params} screen="backlog" />;
}
