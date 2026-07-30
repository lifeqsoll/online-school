-- CreateEnum
CREATE TYPE "StoredFileOwnerType" AS ENUM ('LESSON_MATERIAL', 'ASSIGNMENT_MATERIAL', 'SUBMISSION_ATTACHMENT');

-- CreateEnum
CREATE TYPE "AssignmentResponseMode" AS ENUM ('QUIZ', 'FILE', 'QUIZ_AND_FILE');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "responseMode" "AssignmentResponseMode" NOT NULL DEFAULT 'QUIZ';

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "ownerType" "StoredFileOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoredFile_ownerType_ownerId_idx" ON "StoredFile"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "StoredFile_courseId_idx" ON "StoredFile"("courseId");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
