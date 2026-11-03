ALTER TABLE "QueueEntry" ADD COLUMN "readyCheckId" TEXT, ADD COLUMN "readyDeadline" TIMESTAMP(3), ADD COLUMN "readyAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bannedUntil" TIMESTAMP(3), ADD COLUMN "banReason" TEXT;
ALTER TABLE "Guild" ADD COLUMN "queueMessageId" TEXT;
CREATE TABLE "SeasonAward" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "seasonName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonAward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeasonAward_seasonId_userId_key" ON "SeasonAward"("seasonId", "userId");
CREATE INDEX "SeasonAward_userId_idx" ON "SeasonAward"("userId");
