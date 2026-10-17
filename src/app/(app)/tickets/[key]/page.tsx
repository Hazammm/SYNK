import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/session";

export default async function TicketReference({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await requirePageUser();
  const { key } = await params;
  const { workspaceId } = await searchParams;
  if (!workspaceId) notFound();
  const tickets = await db.ticket.findMany({ where: {
    key, project: { workspaceId, access: { some: { userId: user.id } }, workspace: { memberships: { some: { userId: user.id } } } },
  }, select: { id: true, key: true, title: true, description: true, status: true, project: { select: { name: true } } } });
  if (!tickets.length) notFound();
  return <section style={{ padding: 32 }}><Link href={`/chat?workspaceId=${encodeURIComponent(workspaceId)}`}>← Back to chat</Link>
    {tickets.map(ticket => <article key={ticket.id}><p>{ticket.project.name} · {ticket.key} · {ticket.status}</p><h1>{ticket.title}</h1><p style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p></article>)}
  </section>;
}
