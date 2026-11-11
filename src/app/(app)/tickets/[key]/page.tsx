import { notFound, redirect } from "next/navigation";
import { findTicketByKey } from "@/features/tickets/service";
import { trackerHref } from "@/features/tickets/ui";
import { requirePageUser } from "@/lib/session";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

// Chat links such as /tickets/SYN-12?workspaceId=… land here. The ticket opens on its
// board; a key the reader cannot access is indistinguishable from one that does not exist.
export default async function TicketReference({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await requirePageUser();
  const { key } = await params;
  const { workspaceId } = await searchParams;
  const ticket = workspaceId ? await findTicketByKey(user.id, workspaceId, key) : null;
  if (!ticket) notFound();
  redirect(trackerHref("board", { workspaceId, projectId: ticket.projectId, boardId: ticket.boardId, ticket: ticket.id }));
}
