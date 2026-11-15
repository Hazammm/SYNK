import { Suspense } from "react";
import { PageLoading } from "@/components/Status";
import { redirect } from "next/navigation";

export default function WorkspaceRoot({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Opening workspace…" />}>
      <WorkspaceRootRedirect params={params} />
    </Suspense>
  );
}

async function WorkspaceRootRedirect({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}): Promise<never> {
  const { workspaceId } = await params;
  redirect(`/w/${workspaceId}/overview`);
}
