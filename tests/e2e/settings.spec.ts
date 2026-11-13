import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createWorkspaceAs } from "./onboard";

test("profile menu and settings: details, rename, notifications, theme and sessions", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  const email = `settings-${nonce}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await createWorkspaceAs(page, { name: "Settings QA", email, workspaceName: `Settings QA ${nonce}` });

  // The name in the header opens a card with the person's details.
  const trigger = page.getByRole("button", { name: "Settings QA" });
  await trigger.click();
  const card = page.getByRole("dialog", { name: "Your profile" });
  await expect(card.getByText(email)).toBeVisible();
  await expect(card.getByText("Email and password")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // A shortcut in the card opens that section of settings.
  await trigger.click();
  await card.getByRole("link", { name: "Notifications" }).click();
  await expect(page).toHaveURL(/\/settings\?section=notifications/);
  const mentions = page.getByRole("switch", { name: /Mentions/ });
  await expect(mentions).toBeChecked();
  await mentions.uncheck();
  await expect(page.getByText("Mentions turned off.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: /Mentions/ })).not.toBeChecked(); // saved on the server

  // Renaming updates the header without signing in again.
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Profile" }).click();
  await page.getByLabel("Display name").fill("Settings Renamed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your name was saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings Renamed" })).toBeVisible();

  // Theme choice applies at once.
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("radio", { name: "White" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "white");

  // The gear in the header always leads back to settings.
  await page.goto("/board");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Password and security" }).click();
  await expect(page.getByText("0 other sessions besides this one.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out of other sessions" })).toBeDisabled();
  expect(errors).toEqual([]);
});
