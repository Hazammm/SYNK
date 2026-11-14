import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createWorkspaceAs } from "./onboard";

// The panel itself, without calling the model: conversations with a real model are
// covered by the integration tests and the agent service's own tests.
test("Synk AI panel: opens on any screen, needs a workspace, and closes with Escape", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await createWorkspaceAs(page, {
    name: "Agent QA",
    email: `agent-${nonce}@example.test`,
    workspaceName: `Agent QA ${nonce}`,
  });

  const launcher = page.getByRole("button", { name: "Ask Synk AI" });
  await launcher.click();
  const panel = page.getByRole("complementary", { name: "Synk AI assistant" });
  await expect(panel.getByRole("textbox", { name: "Message Synk AI" })).toBeVisible();
  await panel.getByRole("button", { name: "Close Synk AI" }).click();
  await expect(panel).toHaveCount(0);

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
