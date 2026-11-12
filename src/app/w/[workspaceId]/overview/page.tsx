import WorkspaceScreenPage from "@/components/WorkspaceScreenPage";

export default function WorkspaceOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<import("@/features/tickets/ui").Selection>;
}) {
  return <WorkspaceScreenPage params={params} screen="overview" searchParams={searchParams} />;
}
