CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "Workspace" ADD COLUMN "createdById" TEXT;

UPDATE "Workspace" AS workspace
SET "createdById" = (
  SELECT membership."userId"
  FROM "Membership" AS membership
  WHERE membership."workspaceId" = workspace."id"
  ORDER BY CASE WHEN membership."role" = 'ADMIN' THEN 0 ELSE 1 END, membership."createdAt"
  LIMIT 1
);

ALTER TABLE "Workspace" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Invite" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "tokenHash" TEXT NOT NULL,
  "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE INDEX "Invite_email_idx" ON "Invite"("email");
CREATE INDEX "Invite_workspaceId_idx" ON "Invite"("workspaceId");

ALTER TABLE "Invite"
  ADD CONSTRAINT "Invite_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invite"
  ADD CONSTRAINT "Invite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "lastActiveWorkspaceId" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_lastActiveWorkspaceId_fkey"
  FOREIGN KEY ("lastActiveWorkspaceId") REFERENCES "Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
