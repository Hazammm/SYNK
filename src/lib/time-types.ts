// Shapes shared by the time tracking API and its client components.
import type { Person } from "./ticket-types";

export type TimeTicket = { id: string; key: string; title: string; projectId: string };
// `endedAt` is null while the timer is running; the client counts the live duration.
export type TimeEntry = { id: string; startedAt: string; endedAt: string | null; note: string; user: Person; ticket: TimeTicket; mine: boolean };
// Returned when a timer starts: the timer it replaced, if one was running.
export type TimerStart = { entry: TimeEntry; stopped: TimeEntry | null };
