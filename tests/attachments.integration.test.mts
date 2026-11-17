import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { createChannel, sendMessage } = await import("../src/features/chat/service");
const { attachmentHeaders, readAttachment, saveAttachment } = await import("../src/lib/attachments");

// admin posts in a private channel. member is in the workspace but not that channel. outsider is elsewhere.
let admin: string, member: string, outsider: string, workspaceId: string, otherWorkspaceId: string, privateChannelId: string;
const users: string[] = [];
const saved: string[] = [];
const missing = (error: unknown) => (error as { status?: number }).status === 404;
const upload = async (userId: string, name: string, type: string) => {
  const attachment = await saveAttachment(userId, workspaceId, new File(["<script>alert(1)</script>"], name, { type }));
  saved.push(attachment.id);
  return attachment;
};

before(async () => {
  for (const name of ["Admin", "Member", "Outsider"]) {
    users.push((await db.user.create({ data: { name, email: `synk-files-${randomUUID()}@example.test` } })).id);
  }
  [admin, member, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Files workspace" })).id;
  otherWorkspaceId = (await createWorkspace(outsider, { name: "Elsewhere" })).id;
  await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id: member } })).email);
  privateChannelId = (await createChannel(admin, workspaceId, { name: "leadership", isPrivate: true })).id;
});

after(async () => {
  const keys = await db.attachment.findMany({ where: { id: { in: saved } }, select: { storageKey: true } });
  await Promise.all(keys.map(({ storageKey }) => rm(join(process.cwd(), ".uploads", storageKey), { force: true })));
  await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("attachments: a posted file is readable only by people who can read its channel", async () => {
  const file = await upload(admin, "plans.pdf", "application/pdf");
  await sendMessage(admin, privateChannelId, { body: "The plan", clientMessageId: randomUUID(), attachmentIds: [file.id] });
  assert.equal((await readAttachment(admin, file.id)).attachment.fileName, "plans.pdf");
  await assert.rejects(readAttachment(member, file.id), missing); // in the workspace, not in the channel
  await assert.rejects(readAttachment(outsider, file.id), missing);
});

test("attachments: a file not yet posted is readable only by its uploader", async () => {
  const draft = await upload(admin, "draft.png", "image/png");
  assert.equal((await readAttachment(admin, draft.id)).attachment.id, draft.id);
  await assert.rejects(readAttachment(member, draft.id), missing);
  await assert.rejects(readAttachment(admin, "not-a-real-attachment"), missing);
});

test("attachments: only plain images are shown in the browser; HTML and SVG are downloaded", () => {
  const headers = (mimeType: string, fileName = "file") => attachmentHeaders({ fileName, mimeType, size: 10 });
  assert.equal(headers("image/png")["Content-Type"], "image/png");
  assert.match(headers("image/png")["Content-Disposition"], /^inline;/);
  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "application/pdf"]) {
    assert.equal(headers(type)["Content-Type"], "application/octet-stream", type);
    assert.match(headers(type)["Content-Disposition"], /^attachment;/, type);
  }
  assert.equal(headers("image/png")["Content-Security-Policy"], "default-src 'none'; sandbox");
  assert.equal(headers("text/html", 'evil".html\r\nX: y')["Content-Disposition"], "attachment; filename*=UTF-8''evil%22.html%0D%0AX%3A%20y");
});
