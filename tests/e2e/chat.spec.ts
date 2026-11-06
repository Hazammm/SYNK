import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database before running browser tests.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../../src/lib/db");
const { createInviteToken, hashInviteToken } = await import("../../src/lib/invite-token");

test("admin onboarding, invite acceptance, live chat, access control and logout", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const member = await memberContext.newPage();
  const nonce = randomUUID().slice(0, 8);
  const adminEmail = `admin-${nonce}@example.test`;
  const memberEmail = `member-${nonce}@example.test`;
  const workspaceName = `Synk QA ${nonce}`;
  const password = "QA-secret-very-long-123!";
  const errors: string[] = [];
  let workspaceId = "";
  for (const page of [admin, member]) page.on("pageerror", error => errors.push(error.message));

  try {
    await admin.goto("/create-workspace");
    await admin.getByLabel("Full name").fill("QA Admin");
    await admin.getByLabel("Work email").fill(adminEmail);
    await admin.getByLabel("Password", { exact: true }).fill(password);
    await admin.getByRole("button", { name: "Continue", exact: true }).click();
    await admin.getByLabel("Workspace name").fill(workspaceName);
    await admin.getByRole("button", { name: "Continue", exact: true }).click();
    await admin.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(admin).toHaveURL(/\/overview/);
    await admin.goto("/chat");
    await expect(admin.getByRole("heading", { name: "Conversations" })).toBeVisible({ timeout: 30_000 });

    const workspaceResponse = await adminContext.request.get("/api/workspaces");
    expect(workspaceResponse.ok()).toBeTruthy();
    const { workspaces } = await workspaceResponse.json();
    const workspace = workspaces.find((item: { name: string }) => item.name === workspaceName);
    expect(workspace).toBeTruthy();
    workspaceId = workspace.id;
    const adminUser = await db.user.findFirstOrThrow({ where: { email: adminEmail }, select: { id: true } });
    const token = createInviteToken();
    await db.invite.create({
      data: {
        workspaceId,
        email: memberEmail,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: adminUser.id,
      },
    });

    await member.goto(`/join/${token}`);
    await expect(member.getByRole("heading", { name: `You've been invited to ${workspaceName}` })).toBeVisible();
    await member.getByLabel("Full name").fill("QA Member");
    await member.getByLabel("Password", { exact: true }).fill(password);
    await member.getByRole("button", { name: "Join workspace", exact: true }).click();
    await expect(member).toHaveURL(/\/overview/);
    expect((await (await memberContext.request.get(`/api/invites/${token}`)).json()).valid).toBe(false);

    const origin = new URL(admin.url()).origin;
    expect((await memberContext.request.get(`/api/workspaces/${workspaceId}/invites`)).status()).toBe(403);
    expect((await memberContext.request.post(`/api/workspaces/${workspaceId}/invites`, {
      headers: { origin }, data: { emails: [`other-${nonce}@example.test`] },
    })).status()).toBe(403);
    expect((await memberContext.request.delete(`/api/workspaces/${workspaceId}/members/${adminUser.id}`, {
      headers: { origin },
    })).status()).toBe(403);

    await admin.goto("/settings");
    await admin.getByRole("button", { name: "Members", exact: true }).click();
    await expect(admin.getByRole("button", { name: "Send invite", exact: true })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await member.goto("/settings");
    await member.getByRole("button", { name: "Members", exact: true }).click();
    await expect(member.getByText(memberEmail)).toBeVisible();
    await expect(member.getByRole("button", { name: "Send invite", exact: true })).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);

    await admin.goto("/chat");
    await member.goto("/chat");
    await expect(member.getByRole("button", { name: "Join channel", exact: true })).toBeVisible();
    await member.getByRole("button", { name: "Join channel", exact: true }).click();
    await expect(member.getByText("Live", { exact: true })).toBeVisible();
    await expect(admin.getByText("Live", { exact: true })).toBeVisible();
    const message = `Live delivery ${nonce} — check SYN-101`;
    const start = Date.now();
    await admin.getByLabel("Message", { exact: true }).fill(message);
    await admin.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(member.getByRole("log", { name: "Channel messages" }).getByText(message)).toBeVisible();
    console.log(`Observed cross-user delivery, including UI actions: ${Date.now() - start} ms`);
    await expect(admin.getByRole("log", { name: "Channel messages" }).locator("article")).toHaveCount(1);
    await member.getByRole("button", { name: "0 replies · Reply" }).click();
    await member.getByLabel("Reply to thread").fill("Thread reply persisted");
    await member.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(admin.getByRole("button", { name: "1 reply · Reply" })).toBeVisible();
    await admin.getByRole("button", { name: "1 reply · Reply" }).click();
    await expect(admin.getByRole("log", { name: "Thread replies" }).getByText("Thread reply persisted")).toBeVisible();
    await admin.getByRole("button", { name: "Close thread" }).click();
    await member.reload();
    await expect(member.getByRole("log", { name: "Channel messages" }).getByText(message)).toBeVisible();

    await admin.getByRole("button", { name: "Create channel", exact: true }).click();
    await admin.getByLabel("Channel name").fill("private-plans");
    await admin.getByLabel("Private channel").check();
    await admin.locator("form").filter({ has: admin.getByLabel("Channel name") }).getByRole("button", { name: "Create channel" }).click();
    await expect(admin.getByRole("heading", { name: "private-plans", exact: true })).toBeVisible();
    await member.reload();
    await expect(member.getByRole("button", { name: "private-plans", exact: true })).toHaveCount(0);
    const { channels } = await (await adminContext.request.get(`/api/workspaces/${workspaceId}/channels`)).json();
    const secret = channels.find((item: { name: string }) => item.name === "private-plans");
    expect((await memberContext.request.get(`/api/channels/${secret.id}/messages`)).status()).toBe(403);
    expect((await memberContext.request.post(`/api/channels/${secret.id}/messages`, {
      headers: { origin }, data: { body: "forbidden", clientMessageId: randomUUID() },
    })).status()).toBe(403);
    const general = channels.find((item: { name: string }) => item.name === "general");
    expect((await adminContext.request.post(`/api/channels/${general.id}/messages`, {
      headers: { origin: "https://attacker.example" }, data: { body: "CSRF", clientMessageId: randomUUID() },
    })).status()).toBe(403);

    await member.setViewportSize({ width: 390, height: 844 });
    await expect(member.getByLabel("Message", { exact: true })).toBeVisible();
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const inputBox = await member.getByLabel("Message", { exact: true }).boundingBox();
    const themeBox = await member.getByRole("button", { name: "Black theme", exact: true }).boundingBox();
    expect(inputBox && themeBox && themeBox.y >= inputBox.y + inputBox.height).toBeTruthy();
    await member.screenshot({ path: "test-results/chat-mobile.png", fullPage: true });

    await member.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(member).toHaveURL(/\/login/);
    expect((await memberContext.request.get("/api/workspaces")).status()).toBe(401);
    await member.getByLabel("Email").fill(memberEmail);
    await member.getByLabel("Password", { exact: true }).fill("incorrect-password");
    await member.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(member.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
    expect((await memberContext.request.get("/api/workspaces")).status()).toBe(401);
    await member.getByLabel("Password", { exact: true }).fill(password);
    await member.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(member).toHaveURL(/\/overview/);
    await member.getByRole("link", { name: "Chat", exact: true }).click();
    await expect(member.getByRole("log", { name: "Channel messages" }).getByText(message)).toBeVisible();
    await member.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(member).toHaveURL(/\/login/);
    expect(errors).toEqual([]);
  } finally {
    await adminContext.close();
    await memberContext.close();
    if (workspaceId) await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail] } } });
    await db.$disconnect();
  }
});
