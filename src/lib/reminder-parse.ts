const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function nextWeekday(from: Date, weekday: number) {
  const next = new Date(from);
  const delta = (weekday + 7 - from.getDay()) % 7 || 7;
  next.setDate(from.getDate() + delta);
  next.setHours(9, 0, 0, 0);
  return next;
}

// /remind in 20m | /remind 1h | /remind tomorrow | /remind monday | /remind 2026-12-01 09:30
export function parseReminderWhen(input: string, now = new Date()): Date | null {
  const text = input.trim().toLowerCase().replace(/^remind(er)?\s+(me\s+)?(about\s+)?(this\s+)?/i, "").replace(/^in\s+/, "");
  if (!text) return null;
  const relative = text.match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
  if (relative) {
    const amount = Number(relative[1]);
    if (!Number.isFinite(amount) || amount < 1 || amount > 10_000) return null;
    const unit = relative[2][0];
    const ms = unit === "d" ? amount * DAY : unit === "h" ? amount * HOUR : amount * MINUTE;
    return new Date(now.getTime() + ms);
  }
  if (text === "later" || text === "1h") return new Date(now.getTime() + HOUR);
  if (text === "tomorrow") {
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = days.indexOf(text);
  if (day >= 0) return nextWeekday(now, day);
  const stamped = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2}):(\d{2}))?$/);
  if (stamped) {
    const date = stamped[2] ? new Date(`${stamped[1]}T${stamped[2].padStart(2, "0")}:${stamped[3]}:00`) : new Date(`${stamped[1]}T09:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function parseRemindCommand(text: string, now = new Date()) {
  const match = text.trim().match(/^\/remind(?:er)?(?:\s+me)?(?:\s+about)?\s+(.+)$/i);
  if (!match) return null;
  const rest = match[1].trim();
  const split = rest.match(/^(in\s+\d+\s*\w+|tomorrow|later|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}(?:[ t]\d{1,2}:\d{2})?)\s*(.*)$/i);
  if (!split) {
    const dueAt = parseReminderWhen(rest, now);
    return dueAt ? { dueAt, text: "" } : null;
  }
  const dueAt = parseReminderWhen(split[1], now);
  if (!dueAt) return null;
  return { dueAt, text: split[2].trim() };
}
