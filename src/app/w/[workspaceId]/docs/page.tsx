import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceDocsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceScreenPage params={params} screen="docs" />;
}
