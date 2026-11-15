import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
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
    const workspaces = await db.workspace.findMany({ where: { createdById: user.id }, select: { id: true } });
    await db.channel.deleteMany({ where: { workspaceId: { in: workspaces.map(workspace => workspace.id) } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces.map(workspace => workspace.id) } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});

test("pull requests: a webhook attaches one to its ticket, and a merge offers to move the ticket to Done", async ({ page }) => {
  const nonce = randomUUID().slice(0, 8);
  testEmail = `pulls-${nonce}@example.test`;
  const fullName = `acme/app-${nonce}`;
  const secret: string = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  // The wizard's first project is "Synk", so its tickets are SYN-1, SYN-2 and so on.
  await createWorkspaceAs(page, { name: "Pulls QA", email: testEmail, workspaceName: `Pulls QA ${nonce}`, projectName: "Synk" });
  await page.goto("/board");
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await page.getByRole("dialog", { name: "New ticket" }).getByLabel("Title", { exact: true }).fill("Fix login");
  await page.getByRole("dialog", { name: "New ticket" }).getByRole("button", { name: "Create ticket" }).click();
  await expect(page.getByRole("button", { name: "Fix login", exact: true })).toBeVisible();

  // With no repository linked, the ticket has no pull request section and the panel says so.
  await page.getByRole("button", { name: "Fix login", exact: true }).click();
  const ticket = page.getByRole("dialog", { name: "Ticket SYN-1" });
  await expect(ticket.getByRole("region", { name: "Comments" })).toBeVisible();
  await expect(ticket.getByRole("region", { name: "Pull requests" })).toHaveCount(0);
  await ticket.getByRole("button", { name: "Close ticket" }).click();
  await page.getByRole("button", { name: "Repositories", exact: true }).click();
  const panel = page.getByRole("region", { name: "Repositories for Synk" });
  await expect(panel.getByText("No repository is linked to this project yet.")).toBeVisible();

  // Linking needs a real GitHub sign-in, so the test adds the repository directly.
  const projectId = new URL(page.url()).searchParams.get("projectId")!;
  await db.repository.create({ data: { projectId, provider: "GITHUB", fullName, url: `https://github.com/${fullName}`, webhookSecret: secret } });
  const deliver = (pull: { state: string; merged: boolean }, key = secret) => {
    const body = JSON.stringify({
      action: "edited", repository: { full_name: fullName },
      pull_request: {
        number: 5, title: "SYN-1 fix the login redirect", html_url: `https://github.com/${fullName}/pull/5`, state: pull.state,
        merged_at: pull.merged ? new Date().toISOString() : null, head: { ref: "fix-login" }, user: { login: "hazam" }, updated_at: new Date().toISOString(),
      },
    });
    return page.request.post("/api/integrations/github/webhook", {
      data: body, headers: { "content-type": "application/json", "x-github-event": "pull_request", "x-hub-signature-256": `sha256=${createHmac("sha256", key).update(body).digest("hex")}` },
    });
  };
  expect((await deliver({ state: "open", merged: false }, "wrong-secret")).status()).toBe(401);
  expect((await deliver({ state: "open", merged: false })).status()).toBe(200);

  // The panel lists the repository with its webhook details, and the ticket shows the open pull request.
  await page.reload();
  await expect(page.getByRole("article").filter({ hasText: "Fix login" })).toContainText("1 pull request");
  await expect(panel.getByRole("link", { name: fullName })).toBeVisible();
  await expect(panel.getByText("1 pull request on tickets")).toBeVisible();
  await panel.getByText("Set up live updates (webhook)").click();
  await expect(panel.getByText("/api/integrations/github/webhook")).toBeVisible();
  await page.getByRole("button", { name: "Fix login", exact: true }).click();
  const pulls = ticket.getByRole("region", { name: "Pull requests" });
  await expect(pulls.getByRole("link", { name: "SYN-1 fix the login redirect" })).toHaveAttribute("href", `https://github.com/${fullName}/pull/5`);
  await expect(pulls.getByText("Open", { exact: true })).toBeVisible();
  await expect(pulls.getByText(/was merged/)).toHaveCount(0);
  await ticket.getByRole("button", { name: "Close ticket" }).click();

  // After the merge arrives, the ticket offers to move itself to Done.
  expect((await deliver({ state: "closed", merged: true })).status()).toBe(200);
  await page.getByRole("button", { name: "Fix login", exact: true }).click();
  await expect(pulls.getByText("Merged", { exact: true })).toBeVisible();
  await expect(pulls.getByText("#5 was merged. Move SYN-1 to Done?")).toBeVisible();
  await pulls.getByRole("button", { name: "Move to Done", exact: true }).click();
  await expect(ticket.getByLabel("Status").locator("option:checked")).toHaveText("Done");
  await expect(pulls.getByText(/was merged/)).toHaveCount(0);

  // Removing it only detaches it from the ticket.
  await pulls.getByRole("button", { name: "Remove pull request #5 from SYN-1" }).click();
  await expect(pulls.getByText("None yet.", { exact: false })).toBeVisible();
  await ticket.getByRole("button", { name: "Close ticket" }).click();
  await expect(page.getByRole("region", { name: /^Done, 1 ticket/ }).getByRole("button", { name: "Fix login", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
