-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "PendingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "body" TEXT NOT NULL,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "pending" JSONB,
    "pendingStatus" "PendingStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "tool" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL,
    "target" TEXT,
    "parameters" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_userId_workspaceId_updatedAt_idx" ON "Conversation"("userId", "workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionLog_userId_createdAt_idx" ON "ActionLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionLog_workspaceId_createdAt_idx" ON "ActionLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

