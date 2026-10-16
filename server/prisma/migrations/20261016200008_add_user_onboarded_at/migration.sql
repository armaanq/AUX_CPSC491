-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- Accounts made before first-run setup existed count as set up, so nobody
-- already using AUX is sent back to import a playlist.
UPDATE "User" SET "onboardedAt" = "createdAt";
