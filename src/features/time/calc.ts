// Pure time-tracking maths in the reader's local time zone, kept apart from React so it can be unit tested.
import { MAX_ENTRY_HOURS, type TimeEntry } from "../../lib/time-types";

const DAY_MS = 86_400_000;
const pad = (value: number) => String(value).padStart(2, "0");

// Monday 00:00 local time of the week containing `date`.
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}
// Adding calendar days rather than 24-hour steps keeps midnight correct across daylight-saving changes.
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, index) => addDays(start, index));
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
