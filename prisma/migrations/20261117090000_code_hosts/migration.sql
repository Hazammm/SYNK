-- CreateEnum
CREATE TYPE "CodeHost" AS ENUM ('GITHUB', 'BITBUCKET');

-- CreateEnum
CREATE TYPE "PullRequestStatus" AS ENUM ('OPEN', 'MERGED', 'DECLINED');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "CodeHost" NOT NULL,
    "fullName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "PullRequestStatus" NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repository_provider_fullName_idx" ON "Repository"("provider", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_projectId_provider_fullName_key" ON "Repository"("projectId", "provider", "fullName");

-- CreateIndex
CREATE INDEX "PullRequest_repositoryId_number_idx" ON "PullRequest"("repositoryId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequest_ticketId_repositoryId_number_key" ON "PullRequest"("ticketId", "repositoryId", "number");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

