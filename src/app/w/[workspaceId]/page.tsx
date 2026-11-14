import { Suspense } from "react";
import { redirect } from "next/navigation";

export default function WorkspaceRoot({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return (
    <Suspense fallback={<div role="status" style={{ padding: 32 }}>Opening workspace…</div>}>
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
