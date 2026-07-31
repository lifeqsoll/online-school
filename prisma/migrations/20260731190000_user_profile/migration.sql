-- AlterTable
ALTER TABLE "User" ADD COLUMN "nickname" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "avatarStorageKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");
