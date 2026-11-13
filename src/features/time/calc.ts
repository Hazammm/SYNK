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

// Seconds worked. A running timer counts up to now, but never past the 24-hour limit.
export function entrySeconds(entry: Pick<TimeEntry, "startedAt" | "endedAt">, now: Date): number {
  const start = Date.parse(entry.startedAt);
  const end = entry.endedAt ? Date.parse(entry.endedAt) : Math.min(now.getTime(), start + MAX_ENTRY_HOURS * 3_600_000);
  return Math.max(0, Math.round((end - start) / 1000));
}

// "45m", "2h 05m", "0m". Seconds are dropped except in the running timer.
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}
export const formatClock = (seconds: number) => `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
export const hours = (seconds: number) => Math.round(seconds / 360) / 10;

// Seconds per day of the week, by the local day each entry started.
export function secondsByDay(entries: TimeEntry[], days: Date[], now: Date): number[] {
  const totals = new Map(days.map(day => [dayKey(day), 0]));
  for (const entry of entries) {
    const key = dayKey(new Date(entry.startedAt));
    if (totals.has(key)) totals.set(key, totals.get(key)! + entrySeconds(entry, now));
  }
  return days.map(day => totals.get(dayKey(day))!);
}

// Totals grouped by any key, largest first.
export function totalsBy<Key extends string>(entries: TimeEntry[], keyOf: (entry: TimeEntry) => Key, labelOf: (entry: TimeEntry) => string, now: Date) {
  const groups = new Map<Key, { key: Key; label: string; seconds: number }>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const group = groups.get(key) ?? { key, label: labelOf(entry), seconds: 0 };
    groups.set(key, { ...group, seconds: group.seconds + entrySeconds(entry, now) });
  }
  return [...groups.values()].sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}
