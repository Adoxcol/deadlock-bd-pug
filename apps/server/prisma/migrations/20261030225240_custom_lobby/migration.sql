-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "callbackSecretHash" TEXT,
ADD COLUMN     "lobbyCreatedById" TEXT,
ADD COLUMN     "lobbyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "partyCode" TEXT;

-- CreateIndex
CREATE INDEX "Match_partyId_idx" ON "Match"("partyId");

-- CreateIndex
CREATE INDEX "Match_draftId_idx" ON "Match"("draftId");
