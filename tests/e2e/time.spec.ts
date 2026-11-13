import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createWorkspaceAs } from "./onboard";

test("time: start and stop a timer from a ticket, add time by hand, see the week and export it", async ({ page }) => {
  // The manual entry is logged for 00:00 to 01:30 today, which is still in the future just after midnight.
  test.skip(new Date().getHours() < 2, "Runs after 02:00 local time.");
  const nonce = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await createWorkspaceAs(page, {
    name: "Time QA",
    email: `time-${nonce}@example.test`,
    workspaceName: `Time QA ${nonce}`,
  });

  // A project with one ticket. The wizard already created a starter project.
  await page.goto("/board");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill("Timesheet");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await page.getByRole("dialog", { name: "New ticket" }).getByLabel("Title", { exact: true }).fill("Build the report");
  await page.getByRole("dialog", { name: "New ticket" }).getByRole("button", { name: "Create ticket" }).click();

  // Start a timer from the ticket itself.
  await page.getByRole("button", { name: "Build the report", exact: true }).click();
  const ticket = page.getByRole("dialog", { name: "Ticket TIM-1" });
  await ticket.getByRole("button", { name: "Start timer" }).click();
  await expect(ticket.getByText("Timer started. Stop it from the Time page.")).toBeVisible();

  // The Time page shows it running and stops it.
  await page.goto("/time");
  const timer = page.getByRole("region", { name: "Timer" });
  await expect(timer.getByText("TIM-1 · Build the report")).toBeVisible();
  await expect(timer.getByRole("status", { name: "Elapsed time" })).toHaveText(/00:00:0\d/);
  await timer.getByRole("button", { name: "Stop" }).click();
  await expect(timer.getByText(/^Logged \dm on TIM-1\.$/)).toBeVisible();
  await expect(timer.getByText("NO TIMER RUNNING")).toBeVisible();

  // Add an hour and a half by hand for today.
  const form = page.getByRole("form", { name: "Add time manually" });
  await form.getByLabel("Ticket").selectOption({ label: "TIM-1 · Build the report" });
  await form.getByLabel("Start").fill("00:00");
  await form.getByLabel("End").fill("01:30");
  await form.getByLabel("Note (optional)").fill("Charts");
  await form.getByRole("button", { name: "Add entry" }).click();
  await expect(form.getByText("Added 1h 30m on TIM-1.")).toBeVisible();

  // The week reflects both entries.
  await expect(page.getByText(/^1h 3\dm$/).first()).toBeVisible();
  const entries = page.getByRole("region", { name: "Entries" });
  await expect(entries.getByText("Charts")).toBeVisible();
  await expect(entries.getByRole("row")).toHaveCount(3); // header and two entries

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = await readFile(await (await downloading).path(), "utf8");
  expect(csv).toContain('"Date","Person","Ticket","Title","Start","End","Hours","Note"');
  expect(csv).toContain('"TIM-1","Build the report"');
  expect(csv).toContain('"1.5","Charts"');

  // Deleting your own entry removes it.
  page.once("dialog", dialog => void dialog.accept());
  await entries.getByRole("button", { name: "Delete time on TIM-1" }).first().click();
  await expect(entries.getByRole("row")).toHaveCount(2);
  expect(errors).toEqual([]);
});
