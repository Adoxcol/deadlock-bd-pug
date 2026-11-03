CREATE TABLE "PugSignup" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdById" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "captainMode" TEXT NOT NULL DEFAULT 'rated',
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "pugId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PugSignup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PugSignup_status_idx" ON "PugSignup"("status");

CREATE TABLE "PugSignupPlayer" (
    "id" TEXT NOT NULL,
    "signupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PugSignupPlayer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PugSignupPlayer_signupId_userId_key" ON "PugSignupPlayer"("signupId", "userId");
ALTER TABLE "PugSignupPlayer" ADD CONSTRAINT "PugSignupPlayer_signupId_fkey" FOREIGN KEY ("signupId") REFERENCES "PugSignup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
