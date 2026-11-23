import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createWorkspaceAs } from "./onboard";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database before running browser tests.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../../src/lib/db");
let testEmail = "";

test.afterEach(async () => {
  const user = testEmail ? await db.user.findUnique({ where: { email: testEmail }, select: { id: true } }) : null;
  if (user) {
    const workspaces = (await db.workspace.findMany({ where: { createdById: user.id }, select: { id: true } })).map(workspace => workspace.id);
    await db.channel.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});

test("shell: Ctrl+K jumps to channels and pages, and searches everything", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  testEmail = `shell-${nonce}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await createWorkspaceAs(page, { name: "Shell QA", email: testEmail, workspaceName: `Shell QA ${nonce}`, projectName: "Synk" });

  await page.goto("/board");
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await page.getByRole("dialog", { name: "New ticket" }).getByLabel("Title", { exact: true }).fill(`Fix the zebra ${nonce} crash`);
  await page.getByRole("dialog", { name: "New ticket" }).getByRole("button", { name: "Create ticket" }).click();
  await expect(page.getByRole("button", { name: `Fix the zebra ${nonce} crash`, exact: true })).toBeVisible();

  // Ctrl+K opens the quick switcher; with no page or channel matching, Enter searches everything.
  await page.keyboard.press("Control+k");
  const switcher = page.getByRole("dialog", { name: "Jump to" });
  await expect(switcher.getByRole("combobox")).toBeFocused();
  await page.keyboard.type(`zebra ${nonce}`);
  await expect(switcher.getByRole("option", { name: /Search everything/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/w\/[^/]+\/search\?q=zebra/);
  const tickets = page.getByRole("region", { name: "Tickets" });
  await tickets.getByRole("link", { name: `SYN-1 Fix the zebra ${nonce} crash` }).click();
  await expect(page.getByRole("dialog", { name: "Ticket SYN-1" })).toBeVisible();

  await page.goto(page.url().replace(/\/board.*/, "/search?q=nothing-matches-this"));
  await expect(page.getByText("Nothing matched.")).toBeVisible();

  // It also jumps straight to a channel or a page by name. The shortcut only works once the
  // freshly loaded page has hydrated, so press it until the switcher opens.
  await expect(async () => {
    if (!(await switcher.isVisible())) await page.keyboard.press("Control+k");
    await expect(switcher.getByRole("combobox")).toBeFocused({ timeout: 1_000 });
  }).toPass();
  await page.keyboard.type("#gen");
  await expect(page.getByRole("dialog", { name: "Jump to" }).getByRole("option", { name: /general/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/chat\/[^/?]+$/);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("people");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
