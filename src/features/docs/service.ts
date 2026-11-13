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
