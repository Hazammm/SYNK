// Shapes shared by the time tracking API and its client components.
import type { Person } from "./ticket-types";

export type TimeTicket = { id: string; key: string; title: string; projectId: string };
// `endedAt` is null while the timer is running; the client counts the live duration.
export type TimeEntry = { id: string; startedAt: string; endedAt: string | null; note: string; user: Person; ticket: TimeTicket; mine: boolean };
// Returned when a timer starts: the timer it replaced, if one was running.
export type TimerStart = { entry: TimeEntry; stopped: TimeEntry | null };
// Entries longer than this are refused, and running timers stop counting at this point.
export const MAX_ENTRY_HOURS = 24;
// Window event fired when a timer starts or stops outside the Time page, so it can refresh.
export const TIMER_CHANGED = "synk-timer-changed";
