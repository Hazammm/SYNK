import { deliverDueScheduled } from "./service";
import { deliverDueReminders } from "../reminders/service";

export async function processDueJobs(now = new Date()) {
  const [scheduled, reminders] = await Promise.all([
    deliverDueScheduled(now),
    deliverDueReminders(now),
  ]);
  return { scheduled: scheduled.delivered, reminders: reminders.fired };
}

export function startScheduler(intervalMs = 15_000) {
  const tick = () => {
    // One line per failed tick: a database outage would otherwise print a full stack every 15 seconds.
    void processDueJobs().catch(error => console.error(`Scheduler tick failed: ${error instanceof Error ? error.message.trim().split("\n").pop() : String(error)}`));
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
