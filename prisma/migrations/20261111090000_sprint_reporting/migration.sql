-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN "carriedOver" INTEGER;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Tickets already in a done column count as completed when they were last changed.
UPDATE "Ticket" AS t SET "completedAt" = t."updatedAt"
FROM "BoardColumn" AS c
WHERE c."id" = t."columnId" AND c."isDone";
