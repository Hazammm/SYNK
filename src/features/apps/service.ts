import { createHash, randomBytes } from "node:crypto";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { requireChannel, requireWorkspace } from "../../lib/permissions";
import { incomingWebhookSchema, webhookPostSchema } from "../../lib/validation";
import { sendMessage } from "../chat/service";
import { CODE_HOSTS } from "../../lib/code-host-types";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function listApps(userId: string, workspaceId: string) {
  await requireWorkspace(userId, workspaceId);
  const [webhooks, repositories] = await Promise.all([
    db.incomingWebhook.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, channelId: true, createdAt: true, lastUsedAt: true, channel: { select: { name: true } } },
    }),
    db.repository.findMany({
      where: { project: { workspaceId } },
      select: { id: true, provider: true, fullName: true, project: { select: { name: true, key: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    apps: [
      ...webhooks.map(hook => ({
        id: hook.id,
        kind: "webhook" as const,
        name: hook.name,
        detail: hook.channel.name ? `#${hook.channel.name}` : "channel",
        channelId: hook.channelId,
        lastUsedAt: hook.lastUsedAt?.toISOString() ?? null,
      })),
      ...repositories.map(repo => ({
        id: repo.id,
        kind: "codehost" as const,
        name: `${CODE_HOSTS[repo.provider].label}: ${repo.fullName}`,
        detail: `${repo.project.key} · ${repo.project.name}`,
        channelId: null as string | null,
        lastUsedAt: null as string | null,
      })),
    ],
  };
}

export async function createWebhook(userId: string, workspaceId: string, input: unknown) {
  const data = incomingWebhookSchema.parse(input);
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const channel = await requireChannel(userId, data.channelId);
  if (channel.workspaceId !== workspaceId) throw new AppError(404, "Channel not found.");
  if (channel.type === "DM" || channel.type === "GROUP_DM") throw new AppError(400, "Incoming webhooks post to channels, not direct messages.");
  const token = randomBytes(32).toString("hex");
  const row = await db.incomingWebhook.create({
    data: {
      workspaceId,
      channelId: data.channelId,
      name: data.name,
      tokenHash: hashToken(token),
      createdById: userId,
    },
  });
  const origin = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000").origin;
  return {
    webhook: {
      id: row.id,
      name: row.name,
      channelId: row.channelId,
      url: `${origin}/api/hooks/${token}`,
      token,
    },
  };
}

export async function deleteWebhook(userId: string, workspaceId: string, webhookId: string) {
  await requireWorkspace(userId, workspaceId, "workspace:manage");
  const result = await db.incomingWebhook.deleteMany({ where: { id: webhookId, workspaceId } });
  if (!result.count) throw new AppError(404, "Webhook not found.");
  return { removed: true };
}

export async function postWebhook(token: string, input: unknown) {
  const { text } = webhookPostSchema.parse(input);
  const hook = await db.incomingWebhook.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { channel: { select: { archivedAt: true, type: true } } },
  });
  if (!hook) throw new AppError(404, "Webhook not found.");
  if (hook.channel.archivedAt) throw new AppError(400, "This channel is archived, so new messages can't be posted.");
  const message = await sendMessage(hook.createdById, hook.channelId, {
    body: text,
    clientId: `hook-${randomBytes(12).toString("hex")}`,
  }, { viaApp: hook.name });
  await db.incomingWebhook.update({ where: { id: hook.id }, data: { lastUsedAt: new Date() } });
  return { ok: true, messageId: message.id };
}
