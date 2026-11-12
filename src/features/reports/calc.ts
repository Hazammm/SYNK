// Pure sprint-report maths, kept free of database and browser code so it can be unit tested.
import type { BurndownPoint } from "../../lib/report-types";

const DAY_MS = 86_400_000;
export const MAX_SPRINT_DAYS = 92;
export const dayOf = (date: Date) => date.toISOString().slice(0, 10);
export const percent = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 100) : 0;

// Every calendar day from start to end inclusive, as YYYY-MM-DD in UTC. Very long sprints are capped.
export function sprintDays(startDate: string, endDate: string): string[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`), end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const count = Math.min(Math.round((end - start) / DAY_MS) + 1, MAX_SPRINT_DAYS);
  return Array.from({ length: count }, (_, index) => dayOf(new Date(start + index * DAY_MS)));
}

/**
 * Remaining tickets at the end of each sprint day, next to the ideal straight line to zero.
 * `completedDays` holds the completion day of each finished ticket. Work finished before the
 * sprint started counts from day one; days after `today` have no actual value yet.
 */
export function burndown(input: { startDate: string; endDate: string; total: number; completedDays: string[]; today: string }): BurndownPoint[] {
  const days = sprintDays(input.startDate, input.endDate);
  const last = Math.max(days.length - 1, 1);
  return days.map((date, index) => ({
    date,
    ideal: Math.round(input.total * (1 - index / last) * 10) / 10,
    remaining: date > input.today ? null : input.total - input.completedDays.filter(day => day <= date).length,
  }));
}
