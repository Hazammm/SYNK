import { expect, type Page } from "@playwright/test";

const defaultPassword = "QA-secret-very-long-123!";

/** New accounts are sent to the two-step profile setup before the app; keep the name and skip the rest. */
export async function finishProfileSetup(page: Page) {
  await expect(page).toHaveURL(/\/welcome/, { timeout: 60_000 });
  const nameStep = page.getByRole("region", { name: "What's your name?" });
  await expect(nameStep.getByLabel("Full name")).not.toHaveValue("");
  await nameStep.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("region", { name: "Tell your team about you" }).getByRole("button", { name: "Skip for now", exact: true }).click();
}

/** Create an admin account and workspace through the current three-step wizard. */
export async function createWorkspaceAs(
  page: Page,
  { name, email, workspaceName, projectName, password = defaultPassword }: { name: string; email: string; workspaceName: string; projectName?: string; password?: string },
) {
  await page.goto("/create-workspace");
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Workspace name").fill(workspaceName);
  if (projectName) await page.getByLabel("First project").fill(projectName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await finishProfileSetup(page);
  await expect(page).toHaveURL(/\/w\/[^/]+\/(?:overview|settings)/, { timeout: 60_000 });
}
