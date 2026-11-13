import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createWorkspaceAs } from "./onboard";

test("docs: create nested pages, format them, check off a task, search and reload", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await createWorkspaceAs(page, {
    name: "Docs QA",
    email: `docs-${nonce}@example.test`,
    workspaceName: `Docs QA ${nonce}`,
  });

  // The wizard already created a starter project, so docs opens ready for the first page.
  await page.goto("/docs");
  await page.getByRole("button", { name: "Create the first page" }).click();
  await expect(page.getByLabel("Page title")).toHaveValue("Untitled"); // the new page has opened
  await page.getByLabel("Page title").fill("Team handbook");
  const source = page.getByLabel("Page content");
  await source.fill("## Onboarding\n\nRead the **handbook** first.\n- [ ] Set up laptop\n- [ ] Meet the team\n\n[Synk](javascript:alert(1))");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // The preview renders the formatting, and a script link stays as text.
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(page.locator("article strong", { hasText: /^handbook$/ })).toBeVisible();
  await expect(page.getByText("[Synk](javascript:alert(1))")).toBeVisible();
  await page.getByRole("checkbox", { name: "Not done" }).first().check();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // A subpage appears under its parent in the tree.
  await page.getByRole("button", { name: "Add subpage" }).click();
  await expect(page.getByLabel("Page title")).toHaveValue("Untitled");
  await page.getByLabel("Page title").fill("Laptop setup");
  await page.getByLabel("Page content").fill("Install **Docker** and Node.");
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Saved.")).toBeVisible();
  const tree = page.getByRole("navigation", { name: "Pages in Handbook" });
  await expect(tree.getByRole("button", { name: "Team handbook" })).toBeVisible();
  await expect(tree.getByRole("group").getByRole("button", { name: "Laptop setup" })).toBeVisible();

  // Search finds the subpage by a word in its content, and opens it.
  await tree.getByRole("button", { name: "Team handbook" }).click();
  await page.getByRole("searchbox", { name: "Search pages" }).fill("docker");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.getByText("1 page found")).toBeVisible();
  await results.getByRole("button", { name: /Laptop setup/ }).click();
  await expect(page.getByLabel("Page title")).toHaveValue("Laptop setup");

  // Everything is still there after a reload, including the checked task.
  await page.reload();
  await expect(page.getByLabel("Page title")).toHaveValue("Laptop setup");
  await page.getByRole("navigation", { name: "Pages in Handbook" }).getByRole("button", { name: "Team handbook" }).click();
  await expect(page.getByRole("checkbox", { name: "Done", exact: true })).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "Not done", exact: true })).toHaveCount(1);
  expect(errors).toEqual([]);
});
