import { NotFoundPanel } from "@/components/Status";

export default function TicketNotFound() {
  return <NotFoundPanel title="Ticket unavailable" message="This ticket does not exist in this workspace, or you do not have project access." href="/chat" action="Back to chat" />;
}
