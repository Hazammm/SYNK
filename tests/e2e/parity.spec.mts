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

test("status, people directory, saved items, channel settings and workspace admin", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  testEmail = `parity-${nonce}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await createWorkspaceAs(page, { name: "Parity QA", email: testEmail, workspaceName: `Parity QA ${nonce}` });
  const base = new URL(page.url()).pathname.replace(/\/(overview|settings).*$/, "");

  // A status preset shows in the people directory.
  await page.goto(`${base}/settings?section=status`);
  await page.getByRole("group", { name: "Status presets" }).getByRole("button", { name: /In a meeting/ }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText("Your status was set.")).toBeVisible();
  await page.goto(`${base}/people`);
  await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();
  await expect(page.getByText("In a meeting").first()).toBeVisible();

  // Save a message for later and find it in the Saved view.
  await page.goto(`${base}/chat`);
  await expect(page.getByRole("log", { name: "Channel messages" })).toHaveAttribute("aria-busy", "false");
  await page.getByLabel("Message", { exact: true }).fill(`Release notes ${nonce}`);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const message = page.getByRole("log", { name: "Channel messages" }).locator("article").filter({ hasText: `Release notes ${nonce}` });
  await expect(message).toBeVisible();
  await message.hover();
  await message.getByRole("button", { name: "Save for later" }).click();
  await expect(message.getByRole("status")).toHaveText("Saved for later.");
  await page.getByRole("button", { name: "Saved for later", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved items" }).getByText(`Release notes ${nonce}`)).toBeVisible();

  // Opening it goes back to the channel; then make #general announcement-only and mute it.
  await page.getByRole("region", { name: "Saved items" }).getByRole("button", { name: /^#general/ }).click();
  await expect(page).toHaveURL(/\?message=/);
  await page.getByRole("button", { name: "Channel settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings for #general" });
  await settings.getByRole("switch").click();
  await expect(settings.getByRole("switch")).toBeChecked();
  await expect(settings.getByText("Only admins can post now.")).toBeVisible();
  await settings.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Mute conversation" }).click();
  await expect(page.getByRole("button", { name: "Unmute conversation" })).toBeVisible();

  // Workspace admin: usage numbers, letting everyone invite, and the export link.
  await page.goto(`${base}/settings?section=admin`);
  await expect(page.getByText("Messages this week")).toBeVisible();
  await page.getByRole("switch", { name: /Every member can invite/ }).click();
  await expect(page.getByRole("switch", { name: /Every member can invite/ })).toBeChecked();
  await expect(page.getByText("Every member can invite now.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download export" })).toHaveAttribute("href", /\/export$/);
  expect(errors).toEqual([]);
});
