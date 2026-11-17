-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('PUBLIC', 'PRIVATE', 'DM', 'GROUP_DM');

-- CreateEnum
CREATE TYPE "ChannelMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MentionKind" AS ENUM ('USER', 'CHANNEL', 'HERE');

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_parentId_channelId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_senderId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Message_channelId_parentId_createdAt_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "Message_id_channelId_key";

-- DropIndex
DROP INDEX IF EXISTS "Message_senderId_channelId_clientMessageId_key";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "topic" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "type" "ChannelType" NOT NULL DEFAULT 'PUBLIC',
ALTER COLUMN "name" DROP NOT NULL;

-- Set general channels as default
UPDATE "Channel" SET "isDefault" = true WHERE "name" = 'general';

-- AlterTable
ALTER TABLE "ChannelMember" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "muted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "role" "ChannelMemberRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable Message: populate workspaceId, authorId, clientId from existing columns if present
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "authorId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "threadRootId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

-- Copy over existing data safely
UPDATE "Message" SET "authorId" = "senderId" WHERE "authorId" IS NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'senderId');
UPDATE "Message" SET "clientId" = "clientMessageId" WHERE "clientId" IS NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'clientMessageId');
UPDATE "Message" SET "threadRootId" = "parentId" WHERE "threadRootId" IS NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'parentId');
UPDATE "Message" m SET "workspaceId" = c."workspaceId" FROM "Channel" c WHERE m."channelId" = c."id" AND m."workspaceId" IS NULL;

-- Remove temporary/stale messages with missing workspaceId or authorId
DELETE FROM "Message" WHERE "workspaceId" IS NULL OR "authorId" IS NULL OR "clientId" IS NULL;

ALTER TABLE "Message" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "authorId" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "clientId" SET NOT NULL;

-- Drop legacy columns if they exist
ALTER TABLE "Message" DROP COLUMN IF EXISTS "clientMessageId";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "parentId";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "senderId";

-- CreateTable Reaction
CREATE TABLE IF NOT EXISTS "Reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable Mention
CREATE TABLE IF NOT EXISTS "Mention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mentionedUserId" TEXT,
    "kind" "MentionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable Attachment
CREATE TABLE IF NOT EXISTS "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable Pin
CREATE TABLE IF NOT EXISTS "Pin" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Reaction_messageId_idx" ON "Reaction"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_messageId_userId_emoji_key" ON "Reaction"("messageId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "Mention_messageId_idx" ON "Mention"("messageId");
CREATE INDEX IF NOT EXISTS "Mention_mentionedUserId_idx" ON "Mention"("mentionedUserId");
CREATE INDEX IF NOT EXISTS "Attachment_messageId_idx" ON "Attachment"("messageId");
CREATE INDEX IF NOT EXISTS "Attachment_workspaceId_idx" ON "Attachment"("workspaceId");
CREATE INDEX IF NOT EXISTS "Pin_channelId_idx" ON "Pin"("channelId");
CREATE UNIQUE INDEX IF NOT EXISTS "Pin_channelId_messageId_key" ON "Pin"("channelId", "messageId");
CREATE INDEX IF NOT EXISTS "Channel_workspaceId_type_idx" ON "Channel"("workspaceId", "type");
CREATE INDEX IF NOT EXISTS "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Message_threadRootId_createdAt_idx" ON "Message"("threadRootId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_workspaceId_idx" ON "Message"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Message_authorId_clientId_key" ON "Message"("authorId", "clientId");

-- Foreign Keys
ALTER TABLE "ChannelMember" DROP CONSTRAINT IF EXISTS "ChannelMember_userId_fkey";
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_workspaceId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_authorId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_threadRootId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadRootId_fkey" FOREIGN KEY ("threadRootId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reaction" DROP CONSTRAINT IF EXISTS "Reaction_messageId_fkey";
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reaction" DROP CONSTRAINT IF EXISTS "Reaction_userId_fkey";
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mention" DROP CONSTRAINT IF EXISTS "Mention_messageId_fkey";
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mention" DROP CONSTRAINT IF EXISTS "Mention_mentionedUserId_fkey";
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_messageId_fkey";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_uploaderId_fkey";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_workspaceId_fkey";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pin" DROP CONSTRAINT IF EXISTS "Pin_channelId_fkey";
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pin" DROP CONSTRAINT IF EXISTS "Pin_messageId_fkey";
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pin" DROP CONSTRAINT IF EXISTS "Pin_pinnedById_fkey";
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

