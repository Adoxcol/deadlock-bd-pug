CREATE TABLE "QueueEntry" (
    "userId" TEXT NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "pugId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "QueueEntry_pugId_joinedAt_idx" ON "QueueEntry"("pugId", "joinedAt");
