-- CreateEnum
CREATE TYPE "InvitePolicy" AS ENUM ('ADMINS', 'EVERYONE');

-- CreateEnum
CREATE TYPE "PostingPolicy" AS ENUM ('EVERYONE', 'ADMINS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MENTION';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_REPLY';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_REACTION';

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "postingPolicy" "PostingPolicy" NOT NULL DEFAULT 'EVERYONE';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "alsoInChannel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "messageId" TEXT,
ALTER COLUMN "ticketId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "away" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "notificationsPausedUntil" TIMESTAMP(3),
ADD COLUMN     "notifyReactions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReplies" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pronouns" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "statusEmoji" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "statusExpiresAt" TIMESTAMP(3),
ADD COLUMN     "statusText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "totpPendingSecret" TEXT,
ADD COLUMN     "totpRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "usePurpose" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "invitePolicy" "InvitePolicy" NOT NULL DEFAULT 'ADMINS';

-- CreateTable
CREATE TABLE "SavedMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedMessage_userId_createdAt_idx" ON "SavedMessage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedMessage_userId_messageId_key" ON "SavedMessage"("userId", "messageId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedMessage" ADD CONSTRAINT "SavedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedMessage" ADD CONSTRAINT "SavedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

