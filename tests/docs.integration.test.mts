import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("../src/lib/db");
const { createWorkspace, addMember } = await import("../src/features/workspaces/service");
const { createProject, setProjectAccess } = await import("../src/features/projects/service");
const { createDoc, deleteDoc, getDoc, listDocs, searchDocs, updateDoc } = await import("../src/features/docs/service");

// admin: workspace admin with WRITE. writer: WRITE. reader: READ.
// bystander: workspace member without project access. outsider: belongs to another workspace.
let admin: string, writer: string, reader: string, bystander: string, outsider: string;
let workspaceId: string, projectId: string, otherProjectId: string;
const users: string[] = [];
const workspaces: string[] = [];
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const rejects = (promise: Promise<unknown>, code: number) => assert.rejects(promise, status(code));
const titles = async (userId = admin) => (await listDocs(userId, projectId)).map(doc => doc.title);

before(async () => {
  for (const name of ["Admin", "Writer", "Reader", "Bystander", "Outsider"]) {
    users.push((await db.user.create({ data: { name, email: `synk-docs-${randomUUID()}@example.test` } })).id);
  }
  [admin, writer, reader, bystander, outsider] = users;
  workspaceId = (await createWorkspace(admin, { name: "Docs workspace" })).id;
  workspaces.push(workspaceId, (await createWorkspace(outsider, { name: "Elsewhere" })).id);
  for (const id of [writer, reader, bystander]) await addMember(admin, workspaceId, (await db.user.findUniqueOrThrow({ where: { id } })).email);
  projectId = (await createProject(admin, workspaceId, { name: "Docs project", key: "DOC" })).id;
  otherProjectId = (await createProject(admin, workspaceId, { name: "Secret project", key: "SEC" })).id;
  await setProjectAccess(admin, projectId, { userId: writer, level: "WRITE" });
  await setProjectAccess(admin, projectId, { userId: reader, level: "READ" });
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test("docs: pages nest under parents in the same project and record who created and edited them", async () => {
  const brief = await createDoc(writer, projectId, { title: "Project brief", content: "# Goals\n\nShip the **beta**." });
  const spec = await createDoc(writer, projectId, { title: "Auth design spec", content: "Login uses NextAuth.", parentId: brief.id });
  const notes = await createDoc(admin, projectId, { title: "  Meeting notes  " });
  assert.deepEqual([brief.parentId, spec.parentId, notes.title, notes.content], [null, brief.id, "Meeting notes", ""]);
  assert.deepEqual([brief.position, notes.position, spec.position], [0, 1, 0]); // positions count per level
  assert.deepEqual([spec.createdBy?.id, spec.lastEditedBy?.id, spec.version, spec.canEdit], [writer, writer, 1, true]);
  assert.deepEqual(await titles(reader), ["Project brief", "Auth design spec", "Meeting notes"]);

  const foreign = await createDoc(admin, otherProjectId, { title: "Secret plan" });
  await rejects(createDoc(writer, projectId, { title: "Wrong parent", parentId: foreign.id }), 400);
  await assert.rejects(createDoc(writer, projectId, { title: "   " }));
  await assert.rejects(createDoc(writer, projectId, { title: "x".repeat(151) }));
  await assert.rejects(createDoc(writer, projectId, { title: "Too long", content: "x".repeat(100_001) }));
});

test("docs: READ can read but not change pages; no access looks like a missing page", async () => {
  const [brief] = await listDocs(admin, projectId);
  const view = await getDoc(reader, brief.id);
  assert.deepEqual([view.title, view.canEdit], ["Project brief", false]);
  await rejects(createDoc(reader, projectId, { title: "Nope" }), 403);
  await rejects(updateDoc(reader, brief.id, { version: view.version, title: "Nope" }), 403);
  await rejects(deleteDoc(reader, brief.id), 403);
  for (const user of [bystander, outsider]) {
    await rejects(getDoc(user, brief.id), 404);
    await rejects(updateDoc(user, brief.id, { version: 1, title: "Nope" }), 404);
    await rejects(listDocs(user, projectId), 403);
  }
  await rejects(getDoc(admin, "missing-doc-id"), 404);
});
