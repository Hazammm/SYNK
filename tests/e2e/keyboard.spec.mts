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

test("keyboard: dialogs trap and return focus, and arrow keys reach message actions", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  testEmail = `keys-${nonce}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await createWorkspaceAs(page, { name: "Keys QA", email: testEmail, workspaceName: `Keys QA ${nonce}` });
  const base = new URL(page.url()).pathname.replace(/\/(overview|settings).*$/, "");

  await page.goto(`${base}/chat`);
  const log = page.getByRole("log", { name: "Channel messages" });
  await expect(log).toHaveAttribute("aria-busy", "false");
  for (const text of [`First ${nonce}`, `Second ${nonce}`]) {
    await page.getByLabel("Message", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(log.getByText(text)).toBeVisible();
  }

  // The channel settings dialog closes on Escape and gives focus back to its button.
  const settingsButton = page.getByRole("button", { name: "Channel settings" });
  await settingsButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings for #general" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(settingsButton).toBeFocused();

  // The quick switcher does the same.
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Jump to" }).getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(settingsButton).toBeFocused();

  // The message list is one Tab stop; arrows move between messages and Tab reaches the actions.
  await log.focus();
  await page.keyboard.press("ArrowUp");
  const last = log.locator("article").filter({ hasText: `Second ${nonce}` });
  await expect(last).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(log.locator("article").filter({ hasText: `First ${nonce}` })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(last.getByRole("button", { name: "Add reaction" })).toBeFocused();
  await expect(last.getByRole("button", { name: "Save for later" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("phone width: no sideways scrolling and the channel name stays on one line", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  testEmail = `phone-${nonce}@example.test`;
  await page.setViewportSize({ width: 375, height: 812 });
  await createWorkspaceAs(page, { name: "Phone QA", email: testEmail, workspaceName: `Phone QA ${nonce}` });
  const base = new URL(page.url()).pathname.replace(/\/(overview|settings).*$/, "");

  for (const path of ["chat", "people", "alerts", "settings?section=status", "settings?section=admin"]) {
    await page.goto(`${base}/${path}`);
    await expect(page.locator("main h1, main h2").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} scrolls sideways`).toBe(true);
  }
  await page.goto(`${base}/chat`);
  const title = page.getByRole("heading", { name: "general", level: 2 });
  const box = await title.boundingBox();
  expect(box!.height).toBeLessThan(30);
});
