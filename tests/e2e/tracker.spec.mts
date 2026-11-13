import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createWorkspaceAs } from "./onboard";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database before running browser tests.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../../src/lib/db");
let testEmail = "";

test.afterEach(async () => {
  if (testEmail) {
    const user = await db.user.findUnique({ where: { email: testEmail }, select: { id: true } });
    if (user) {
      const workspaces = await db.workspace.findMany({ where: { createdById: user.id }, select: { id: true } });
      const workspaceIds = workspaces.map(workspace => workspace.id);
      if (workspaceIds.length) {
        await db.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
        await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      }
      await db.user.delete({ where: { id: user.id } });
    }
    testEmail = "";
  }
  await db.$disconnect();
});

test("issue tracking: project, ticket lifecycle, delete, sprint, report export and overview", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  testEmail = `tracker-${nonce}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await createWorkspaceAs(page, { name: "Tracker QA", email: testEmail, workspaceName: `Tracker QA ${nonce}` });
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible({ timeout: 30_000 });

  // The workspace wizard creates a starter project; add the project exercised below.
  await page.goto("/board");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill("Browser QA");
  await expect(page.getByLabel("Ticket key")).toHaveValue("BQ");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("region", { name: "To Do, 0 tickets" })).toBeVisible();

  async function createTicket(title: string) {
    await page.getByRole("button", { name: "New ticket", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New ticket" });
    await dialog.getByLabel("Title", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "Create ticket" }).click();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
  }

  // Create a ticket, then finish it from the ticket form.
  await createTicket("Ship the report");
  await page.getByRole("button", { name: "Ship the report", exact: true }).click();
  const ticket = page.getByRole("dialog", { name: "Ticket BQ-1" });
  await ticket.getByRole("combobox", { name: "Status", exact: true }).selectOption({ label: "Done" });
  await ticket.getByRole("button", { name: "Save changes" }).click();
  await expect(ticket.getByText("Changes saved.")).toBeVisible();
  await ticket.getByRole("button", { name: "Close ticket" }).click();
  await expect(page.getByRole("region", { name: "Done, 1 ticket" })).toBeVisible();

  // Deleting asks for confirmation and removes the card.
  await createTicket("Delete me");
  await page.getByRole("button", { name: "Delete me", exact: true }).click();
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("dialog", { name: "Ticket BQ-2" }).getByRole("button", { name: "Delete ticket" }).click();
  await expect(page.getByRole("button", { name: "Delete me", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "To Do, 0 tickets" })).toBeVisible();

  // Plan a sprint, move the finished ticket into it and start it.
  await page.getByRole("navigation", { name: "Issue tracking views" }).getByRole("link", { name: "Sprints" }).click();
  await page.getByRole("button", { name: "New sprint" }).click();
  await page.getByLabel("Sprint name").fill("Sprint A");
  await page.getByLabel("Start date").fill(day(-1));
  await page.getByLabel("End date").fill(day(5));
  await page.getByRole("button", { name: "Create sprint", exact: true }).click();
  await page.getByLabel("Sprint for BQ-1").selectOption({ label: "Sprint A" });
  await expect(page.getByText("1 of 1 done (100%)")).toBeVisible();
  await page.getByRole("button", { name: "Start sprint" }).click();
  await expect(page.getByRole("button", { name: "Complete sprint" })).toBeVisible();

  // The report reflects the sprint and exports it.
  await page.getByRole("navigation", { name: "Issue tracking views" }).getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Sprint reports" })).toBeVisible();
  await expect(page.getByText("100% of the sprint")).toBeVisible();
  await expect(page.getByRole("img", { name: /Burndown chart: 0 of 1 tickets remaining/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /BQ-1 Ship the report Done/ })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("synk-bq-sprint-a.csv");
  const csv = await readFile(await download.path(), "utf8");
  expect(csv).toContain('"Key","Title","Status","Priority","Assignee","Completed"');
  expect(csv).toContain('"BQ-1","Ship the report","Done","Medium","Unassigned"');

  // The overview links back to the running sprint.
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Welcome back, Tracker" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sprint A" })).toBeVisible();
  await expect(page.getByText("Nothing is assigned to you right now.")).toBeVisible();
  expect(errors).toEqual([]);
});
