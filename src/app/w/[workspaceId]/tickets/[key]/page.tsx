import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireWorkspaceUser } from "@/lib/workspace-context";
import { ArrowLeft } from "lucide-react";
import styles from "@/components/Status.module.css";

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
    <section className={styles.article}>
      <Link href={`/w/${workspaceId}/chat`} className={styles.back}><ArrowLeft size={15} aria-hidden="true" /> Back to chat</Link>
      {tickets.map(ticket => (
        <article key={ticket.id}>
          <p className={styles.crumbs}>{ticket.project.name} <code>{ticket.key}</code> <span>{ticket.column.name}</span></p>
          <h1>{ticket.title}</h1>
          {ticket.description ? <p className={styles.body}>{ticket.description}</p> : <p className={styles.bodyEmpty}>No description.</p>}
        </article>
      ))}
    </section>
  );
}
