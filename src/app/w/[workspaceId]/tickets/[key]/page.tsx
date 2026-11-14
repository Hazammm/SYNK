import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireWorkspaceUser } from "@/lib/workspace-context";

export const instant = false;

export default async function WorkspaceTicketReference({
  params,
}: {
  params: Promise<{ workspaceId: string; key: string }>;
}) {
  const { workspaceId, key } = await params;
  const user = await requireWorkspaceUser(workspaceId);

  const tickets = await db.ticket.findMany({
    where: {
      key,
      project: {
        workspaceId,
        access: { some: { userId: user.id } },
        workspace: { memberships: { some: { userId: user.id } } },
      },
    },
    select: {
      id: true,
      key: true,
      title: true,
      description: true,
      column: { select: { name: true } },
      project: { select: { name: true } },
    },
  });

  if (!tickets.length) notFound();

  return (
    <section style={{ padding: 32 }}>
      <Link href={`/w/${workspaceId}/chat`}>← Back to chat</Link>
      {tickets.map(ticket => (
        <article key={ticket.id}>
          <p>{ticket.project.name} · {ticket.key} · {ticket.column.name}</p>
          <h1>{ticket.title}</h1>
          <p style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
        </article>
      ))}
    </section>
  );
}
