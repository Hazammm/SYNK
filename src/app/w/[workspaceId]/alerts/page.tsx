import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceAlertsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceScreenPage params={params} screen="alerts" />;
}
