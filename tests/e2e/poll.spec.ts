import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createWorkspaceAs } from "./onboard";

test("composer can create a poll in the default channel", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  await createWorkspaceAs(page, { name: "Poll QA", email: `poll-${nonce}@example.test`, workspaceName: `Poll QA ${nonce}` });
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/w\/[^/]+\/chat/);
  await expect(page.getByRole("textbox", { name: /Message/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Create a poll|Crear una encuesta/ }).click();
  await page.getByLabel("Poll question").fill("Ship on Friday?");
  await page.getByLabel("Poll options, one per line").fill("Yes\nNo");
  await page.getByRole("button", { name: "Create poll" }).click();
  await expect(page.getByText("Ship on Friday?")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Yes")).toBeVisible();
  await page.getByRole("radio", { name: /^Yes/ }).check();
  await page.getByRole("button", { name: /Vote|Votar/ }).click();
  await expect(page.getByText(/1 ·/)).toBeVisible({ timeout: 10_000 });
});
