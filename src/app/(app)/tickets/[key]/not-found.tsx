import Link from "next/link";
export default function NotFound() {
  return <section style={{ padding: 32 }}><h1>Ticket unavailable</h1><p>This ticket does not exist in this workspace, or you do not have project access.</p><Link href="/chat">Back to chat</Link></section>;
}
