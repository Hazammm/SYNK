ALTER TABLE "User" ADD COLUMN "profileSetupAt" TIMESTAMP(3);

-- People who already added a photo or title have set up their profile.
UPDATE "User" SET "profileSetupAt" = NOW() WHERE "avatarKey" IS NOT NULL OR "title" <> '';
