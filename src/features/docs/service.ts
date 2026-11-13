import { Prisma } from "@prisma/client";
import { db } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { can, requireProject, requireWorkspace } from "../../lib/permissions";
import { docCreateSchema, docSearchSchema, docUpdateSchema, idSchema } from "../../lib/validation";
import { plainText } from "../../lib/markdown";
import type { DocDetail, DocSearchResult, DocSummary } from "../../lib/doc-types";

type Database = Prisma.TransactionClient;
const MAX_LISTED_DOCS = 1000;
const MAX_SEARCH_RESULTS = 20;
const SNIPPET_LENGTH = 160;
const person = { select: { id: true, name: true } } satisfies Prisma.UserDefaultArgs;
const summarySelect = { id: true, parentId: true, title: true, position: true, lastEditedAt: true, lastEditedBy: person } satisfies Prisma.DocSelect;
const detailInclude = { lastEditedBy: person, createdBy: person } satisfies Prisma.DocInclude;
type SummaryRecord = Prisma.DocGetPayload<{ select: typeof summarySelect }>;
type DetailRecord = Prisma.DocGetPayload<{ include: typeof detailInclude }>;

const serializeSummary = (row: SummaryRecord): DocSummary => ({
  id: row.id, parentId: row.parentId, title: row.title, position: row.position, lastEditedAt: row.lastEditedAt.toISOString(), lastEditedBy: row.lastEditedBy,
});
const serializeDetail = (row: DetailRecord, canEdit: boolean): DocDetail => ({
  ...serializeSummary(row), projectId: row.projectId, content: row.content, version: row.version,
  createdAt: row.createdAt.toISOString(), createdBy: row.createdBy, canEdit,
});

// A page the caller cannot read is reported as missing, so its existence is not revealed.
async function requireDoc(userId: string, docId: string, write: boolean, database: Database = db) {
  idSchema.parse(docId);
  const doc = await database.doc.findUnique({ where: { id: docId }, select: { id: true, projectId: true } });
  const access = doc && await requireProject(userId, doc.projectId, "doc:read", database).catch(() => null);
  if (!doc || !access) throw new AppError(404, "Page not found.");
  const canEdit = can("doc:write", { role: access.role, projectLevel: access.level });
  if (write && !canEdit) throw new AppError(403, "You have view-only access to this project's pages.");
  return { doc, project: access.project, canEdit };
}

async function requireParent(database: Database, projectId: string, parentId: string) {
  const parent = await database.doc.findFirst({ where: { id: parentId, projectId }, select: { id: true } });
  if (!parent) throw new AppError(400, "The parent page must be in the same project.");
}

export async function listDocs(userId: string, projectId: string): Promise<DocSummary[]> {
  await requireProject(userId, projectId, "doc:read");
  const rows = await db.doc.findMany({ where: { projectId }, select: summarySelect, orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: MAX_LISTED_DOCS });
  return rows.map(serializeSummary);
}

export async function getDoc(userId: string, docId: string): Promise<DocDetail> {
  const { canEdit } = await requireDoc(userId, docId, false);
  return serializeDetail(await db.doc.findUniqueOrThrow({ where: { id: docId }, include: detailInclude }), canEdit);
}

export async function createDoc(userId: string, projectId: string, input: unknown): Promise<DocDetail> {
  const { title, content, parentId } = docCreateSchema.parse(input);
  return db.$transaction(async tx => {
    await requireProject(userId, projectId, "doc:write", tx);
    if (parentId) await requireParent(tx, projectId, parentId);
    // New pages go to the end of their level.
    const last = await tx.doc.aggregate({ where: { projectId, parentId: parentId ?? null }, _max: { position: true } });
    const doc = await tx.doc.create({
      data: { projectId, parentId: parentId ?? null, title, content, position: (last._max.position ?? -1) + 1, createdById: userId, lastEditedById: userId },
      include: detailInclude,
    });
    return serializeDetail(doc, true);
  });
}

// `version` is the one the editor started from. A save on top of someone else's newer save is
// refused instead of silently overwriting it.
export async function updateDoc(userId: string, docId: string, input: unknown): Promise<DocDetail> {
  const { version, parentId, ...fields } = docUpdateSchema.parse(input);
  return db.$transaction(async tx => {
    const { doc } = await requireDoc(userId, docId, true, tx);
    await tx.$executeRaw`SELECT 1 FROM "Doc" WHERE "id" = ${docId} FOR UPDATE`;
    const current = await tx.doc.findUniqueOrThrow({ where: { id: docId }, include: { lastEditedBy: person } });
    if (current.version !== version) {
      throw new AppError(409, `${current.lastEditedBy?.name ?? "Someone"} saved this page while you were editing. Copy your changes, then reload to see theirs.`);
    }
    const data: Prisma.DocUncheckedUpdateInput = { ...fields, version: { increment: 1 }, lastEditedById: userId, lastEditedAt: new Date() };
    if (parentId !== undefined && parentId !== current.parentId) {
      if (parentId) {
        await requireParent(tx, doc.projectId, parentId);
        // Walking up from the new parent must never reach this page, or the tree would loop.
        for (let at: string | null = parentId; at; at = (await tx.doc.findUnique({ where: { id: at }, select: { parentId: true } }))?.parentId ?? null) {
          if (at === docId) throw new AppError(400, "A page cannot be moved inside itself or one of its subpages.");
        }
      }
      const last = await tx.doc.aggregate({ where: { projectId: doc.projectId, parentId }, _max: { position: true } });
      data.parentId = parentId;
      data.position = (last._max.position ?? -1) + 1;
    }
    return serializeDetail(await tx.doc.update({ where: { id: docId }, data, include: detailInclude }), true);
  });
}

// Deleting a page deletes its subpages too. Returns how many pages were removed.
export async function deleteDoc(userId: string, docId: string) {
  return db.$transaction(async tx => {
    await requireDoc(userId, docId, true, tx);
    const [{ count }] = await tx.$queryRaw<{ count: bigint }[]>`
      WITH RECURSIVE tree AS (SELECT "id" FROM "Doc" WHERE "id" = ${docId} UNION ALL SELECT d."id" FROM "Doc" d JOIN tree t ON d."parentId" = t."id")
      SELECT COUNT(*) AS count FROM tree`;
    // deleteMany reports a count instead of throwing, so losing a race with another delete is a clean 404.
    if (!(await tx.doc.deleteMany({ where: { id: docId } })).count) throw new AppError(404, "Page not found.");
    return { deleted: Number(count) };
  });
}
