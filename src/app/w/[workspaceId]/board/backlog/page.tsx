import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceBacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<import("@/features/tickets/ui").Selection>;
}) {
  return <WorkspaceScreenPage params={params} screen="backlog" searchParams={searchParams} />;
}
