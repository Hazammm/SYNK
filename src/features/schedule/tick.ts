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
    void processDueJobs().catch(error => console.error("Scheduler tick failed", error));
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
