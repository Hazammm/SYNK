import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceTimePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceScreenPage params={params} screen="time" />;
}
