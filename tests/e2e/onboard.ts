import { expect, type Page } from "@playwright/test";

const defaultPassword = "QA-secret-very-long-123!";

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
  await expect(page).toHaveURL(/\/w\/[^/]+\/(?:overview|settings)/, { timeout: 60_000 });
}
