-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyAssigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMentions" BOOLEAN NOT NULL DEFAULT true;
