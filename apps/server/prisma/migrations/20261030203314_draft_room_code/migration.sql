-- AlterTable
ALTER TABLE "DraftRoom" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE INDEX "DraftRoom_code_createdAt_idx" ON "DraftRoom"("code", "createdAt");
