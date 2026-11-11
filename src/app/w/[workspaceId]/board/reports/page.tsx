import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceReportsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceScreenPage params={params} screen="reports" />;
}
