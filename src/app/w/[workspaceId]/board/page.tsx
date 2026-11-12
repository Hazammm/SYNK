import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<import("@/features/tickets/ui").Selection>;
}) {
  return <WorkspaceScreenPage params={params} screen="board" searchParams={searchParams} />;
}
