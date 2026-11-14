-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SprintState" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TICKET_ASSIGNED', 'TICKET_COMMENT', 'TICKET_MENTION');

-- AlterTable: Project. `key` starts nullable so existing rows can be backfilled.
ALTER TABLE "Project" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "nextTicketNumber" INTEGER NOT NULL DEFAULT 1;

-- Backfill: reuse the prefix of the project's existing ticket keys (SYN in SYN-101).
UPDATE "Project" p SET "key" = sub.prefix
FROM (
  SELECT "projectId", min(split_part("key", '-', 1)) AS prefix
  FROM "Ticket" WHERE "key" ~ '^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$' GROUP BY "projectId"
) sub
WHERE p."id" = sub."projectId";

-- Projects without usable ticket keys, or sharing a prefix inside one workspace, get PRJ1, PRJ2, ...
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "workspaceId", "key" ORDER BY "id") AS copy FROM "Project"
), fallback AS (
  SELECT p."id", row_number() OVER (PARTITION BY p."workspaceId" ORDER BY p."id") AS n
  FROM "Project" p JOIN ranked r ON r."id" = p."id"
  WHERE p."key" IS NULL OR r.copy > 1
)
UPDATE "Project" p SET "key" = 'PRJ' || fallback.n FROM fallback WHERE p."id" = fallback."id";

-- Continue numbering after the highest existing ticket that uses the project's prefix.
UPDATE "Project" p SET "nextTicketNumber" = sub.highest + 1
FROM (
  SELECT t."projectId", max(split_part(t."key", '-', 2)::INTEGER) AS highest
  FROM "Ticket" t JOIN "Project" p2 ON p2."id" = t."projectId"
  WHERE t."key" ~ ('^' || p2."key" || '-[1-9][0-9]{0,8}$') GROUP BY t."projectId"
) sub
WHERE p."id" = sub."projectId";

ALTER TABLE "Project" ALTER COLUMN "key" SET NOT NULL;

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "state" "SprintState" NOT NULL DEFAULT 'PLANNED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "NotificationType" NOT NULL,
    "ticketId" TEXT NOT NULL,
    "commentId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Backfill: every existing project gets a default board with the standard columns.
INSERT INTO "Board" ("id", "projectId", "name")
SELECT replace(gen_random_uuid()::TEXT, '-', ''), "id", 'Main board' FROM "Project";

INSERT INTO "BoardColumn" ("id", "boardId", "name", "position", "isDone")
SELECT replace(gen_random_uuid()::TEXT, '-', ''), b."id", c.name, c.position, c.done
FROM "Board" b
CROSS JOIN (VALUES ('To Do', 0, false), ('In Progress', 1, false), ('Review', 2, false), ('Done', 3, true)) AS c(name, position, done);

-- AlterTable: Ticket. Board and column start nullable for the backfill.
ALTER TABLE "Ticket" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "boardId" TEXT,
ADD COLUMN     "columnId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "reporterId" TEXT,
ADD COLUMN     "sprintId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: place each ticket on its project's board, in the column matching its old status text.
UPDATE "Ticket" t SET "boardId" = b."id" FROM "Board" b WHERE b."projectId" = t."projectId";

UPDATE "Ticket" t SET "columnId" = c."id"
FROM "BoardColumn" c
WHERE c."boardId" = t."boardId" AND lower(replace(c."name", ' ', '')) = lower(replace(t."status", ' ', ''));

-- Old "In review" maps to the new "Review" column; anything unrecognised goes to the first column.
UPDATE "Ticket" t SET "columnId" = c."id"
FROM "BoardColumn" c
WHERE t."columnId" IS NULL AND c."boardId" = t."boardId"
  AND c."position" = CASE WHEN lower(replace(t."status", ' ', '')) = 'inreview' THEN 2 ELSE 0 END;

UPDATE "Ticket" t SET "position" = ordered.position
FROM (SELECT "id", row_number() OVER (PARTITION BY "columnId" ORDER BY "key") - 1 AS position FROM "Ticket") ordered
WHERE t."id" = ordered."id";

ALTER TABLE "Ticket" ALTER COLUMN "boardId" SET NOT NULL,
ALTER COLUMN "columnId" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT,
DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "Board_projectId_idx" ON "Board"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Board_id_projectId_key" ON "Board"("id", "projectId");

-- CreateIndex
CREATE INDEX "BoardColumn_boardId_position_idx" ON "BoardColumn"("boardId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "BoardColumn_id_boardId_key" ON "BoardColumn"("id", "boardId");

-- CreateIndex
CREATE INDEX "Sprint_projectId_state_idx" ON "Sprint"("projectId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_id_projectId_key" ON "Sprint"("id", "projectId");

-- CreateIndex
CREATE INDEX "Comment_ticketId_createdAt_idx" ON "Comment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_key_key" ON "Project"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "Ticket_boardId_columnId_position_idx" ON "Ticket"("boardId", "columnId", "position");

-- CreateIndex
CREATE INDEX "Ticket_projectId_sprintId_idx" ON "Ticket"("projectId", "sprintId");

-- CreateIndex
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_boardId_projectId_fkey" FOREIGN KEY ("boardId", "projectId") REFERENCES "Board"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_columnId_boardId_fkey" FOREIGN KEY ("columnId", "boardId") REFERENCES "BoardColumn"("id", "boardId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_sprintId_projectId_fkey" FOREIGN KEY ("sprintId", "projectId") REFERENCES "Sprint"("id", "projectId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

