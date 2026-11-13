import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

// The panel itself, without calling the model: conversations with a real model are
// covered by the integration tests and the agent service's own tests.
test("Synk AI panel: opens on any screen, needs a workspace, and closes with Escape", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Agent QA");
  await page.getByLabel("Workspace email").fill(`agent-${nonce}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("QA-secret-very-long-123!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible({ timeout: 30_000 });

  // Without a workspace there is nothing for the assistant to work in.
  const launcher = page.getByRole("button", { name: "Ask Synk AI" });
  await launcher.click();
  const panel = page.getByRole("complementary", { name: "Synk AI assistant" });
  await expect(panel.getByText("Create or join a workspace")).toBeVisible();
  await panel.getByRole("button", { name: "Close Synk AI" }).click();
  await expect(panel).toHaveCount(0);

  await page.getByLabel("Workspace name").fill(`Agent QA ${nonce}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "general", exact: true })).toBeVisible();

  // The same launcher is on the board, and a suggestion fills the message box without sending.
  await page.goto("/board");
  await page.getByRole("button", { name: "Ask Synk AI" }).click();
  const box = panel.getByRole("textbox", { name: "Message Synk AI" });
  await expect(box).toBeFocused();
  await expect(panel.getByRole("button", { name: "Send message" })).toBeDisabled();
  await panel.getByRole("button", { name: "What is assigned to me?" }).click();
  await expect(box).toHaveValue("What is assigned to me?");
  await expect(panel.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(panel.getByRole("button", { name: "History" })).toBeDisabled(); // no conversations yet

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Synk AI" })).toBeFocused();
  expect(errors).toEqual([]);
});
