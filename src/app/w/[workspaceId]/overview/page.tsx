import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceScreenPage params={params} screen="overview" />;
}
