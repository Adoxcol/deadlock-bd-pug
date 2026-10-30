-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'CAPTAIN', 'PLAYER', 'SPECTATOR');

-- CreateEnum
CREATE TYPE "PugStatus" AS ENUM ('WAITING', 'DRAFTING', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DraftProviderKind" AS ENUM ('NATIVE', 'DEADLOCKLABS', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('AMBER', 'SAPPHIRE');

-- CreateEnum
CREATE TYPE "DraftActionKind" AS ENUM ('PICK', 'BAN');

-- CreateEnum
CREATE TYPE "ResultSource" AS ENUM ('API', 'MANUAL', 'SIMULATED');

-- CreateEnum
CREATE TYPE "TrackingState" AS ENUM ('WAITING_FOR_LOBBY', 'LOBBY_FOUND', 'WAITING_FOR_MATCH', 'MATCH_DETECTED', 'LIVE_AVAILABLE', 'LIVE_UNAVAILABLE', 'MATCH_COMPLETED', 'MATCH_DATA_PENDING', 'MATCH_NOT_FOUND', 'API_UNAVAILABLE', 'MANUAL_REQUIRED');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'MEMBERS', 'PRIVATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteamAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steamId64" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "personaName" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteamAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "discordGuildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "announceChannelId" TEXT,
    "resultsChannelId" TEXT,
    "draftChannelId" TEXT,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "initialRating" INTEGER NOT NULL DEFAULT 1500,
    "kFactor" INTEGER NOT NULL DEFAULT 24,
    "softResetFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PugSession" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "guildId" TEXT,
    "status" "PugStatus" NOT NULL DEFAULT 'WAITING',
    "format" TEXT NOT NULL DEFAULT '6v6',
    "draftProvider" "DraftProviderKind" NOT NULL DEFAULT 'NATIVE',
    "createdById" TEXT NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PugSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PugParticipant" (
    "id" TEXT NOT NULL,
    "pugId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" "TeamSide",
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PugParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "pugId" TEXT NOT NULL,
    "side" "TeamSide" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftRoom" (
    "id" TEXT NOT NULL,
    "pugId" TEXT,
    "name" TEXT NOT NULL,
    "amberName" TEXT NOT NULL,
    "sapphireName" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "config" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DraftRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftParticipant" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" "TeamSide",
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "displayNameSnapshot" TEXT NOT NULL,

    CONSTRAINT "DraftParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftAction" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "team" "TeamSide" NOT NULL,
    "kind" "DraftActionKind" NOT NULL,
    "heroId" INTEGER,
    "actorId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftSelection" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "team" "TeamSide" NOT NULL,
    "order" INTEGER NOT NULL,
    "heroId" INTEGER NOT NULL,
    "heroNameSnapshot" TEXT NOT NULL,

    CONSTRAINT "DraftSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftBan" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "team" "TeamSide" NOT NULL,
    "order" INTEGER NOT NULL,
    "heroId" INTEGER NOT NULL,
    "heroNameSnapshot" TEXT NOT NULL,

    CONSTRAINT "DraftBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalDraftLink" (
    "id" TEXT NOT NULL,
    "pugId" TEXT NOT NULL,
    "provider" "DraftProviderKind" NOT NULL,
    "url" TEXT NOT NULL,
    "importedResult" JSONB,
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalDraftLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "deadlockMatchId" TEXT,
    "partyId" TEXT,
    "lobbyId" TEXT,
    "pugId" TEXT,
    "draftId" TEXT,
    "trackingState" "TrackingState" NOT NULL DEFAULT 'WAITING_FOR_MATCH',
    "trackingNote" TEXT,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "steamAccountId" TEXT,
    "team" "TeamSide" NOT NULL,
    "heroId" INTEGER,
    "displayNameSnapshot" TEXT NOT NULL,
    "heroNameSnapshot" TEXT,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "gameTime" DOUBLE PRECISION,
    "data" JSONB NOT NULL,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "winner" "TeamSide" NOT NULL,
    "source" "ResultSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "rated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStatistic" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "userId" TEXT,
    "team" "TeamSide" NOT NULL,
    "heroId" INTEGER,
    "kills" INTEGER,
    "deaths" INTEGER,
    "assists" INTEGER,
    "netWorth" INTEGER,
    "heroDamage" INTEGER,
    "won" BOOLEAN NOT NULL,
    "displayNameSnapshot" TEXT NOT NULL,

    CONSTRAINT "PlayerStatistic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingTransaction" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "before" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordNotification" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channelId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "DiscordNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hero" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hero_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccount_userId_key" ON "DiscordAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccount_discordId_key" ON "DiscordAccount"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "SteamAccount_userId_key" ON "SteamAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SteamAccount_steamId64_key" ON "SteamAccount"("steamId64");

-- CreateIndex
CREATE UNIQUE INDEX "SteamAccount_accountId_key" ON "SteamAccount"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_discordGuildId_key" ON "Guild"("discordGuildId");

-- CreateIndex
CREATE UNIQUE INDEX "PugSession_number_key" ON "PugSession"("number");

-- CreateIndex
CREATE INDEX "PugSession_status_createdAt_idx" ON "PugSession"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PugParticipant_pugId_userId_key" ON "PugParticipant"("pugId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_pugId_side_key" ON "Team"("pugId", "side");

-- CreateIndex
CREATE INDEX "DraftRoom_status_idx" ON "DraftRoom"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DraftParticipant_draftId_userId_key" ON "DraftParticipant"("draftId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftAction_draftId_seq_key" ON "DraftAction"("draftId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSelection_draftId_team_order_key" ON "DraftSelection"("draftId", "team", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DraftBan_draftId_team_order_key" ON "DraftBan"("draftId", "team", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Match_deadlockMatchId_key" ON "Match"("deadlockMatchId");

-- CreateIndex
CREATE INDEX "Match_trackingState_idx" ON "Match"("trackingState");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_steamAccountId_key" ON "MatchParticipant"("matchId", "steamAccountId");

-- CreateIndex
CREATE INDEX "MatchEvent_matchId_tick_idx" ON "MatchEvent"("matchId", "tick");

-- CreateIndex
CREATE UNIQUE INDEX "MatchEvent_matchId_dedupeKey_key" ON "MatchEvent"("matchId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_matchId_key" ON "MatchResult"("matchId");

-- CreateIndex
CREATE INDEX "PlayerStatistic_userId_idx" ON "PlayerStatistic"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStatistic_resultId_userId_key" ON "PlayerStatistic"("resultId", "userId");

-- CreateIndex
CREATE INDEX "PlayerRating_seasonId_rating_idx" ON "PlayerRating"("seasonId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRating_seasonId_userId_key" ON "PlayerRating"("seasonId", "userId");

-- CreateIndex
CREATE INDEX "RatingTransaction_userId_createdAt_idx" ON "RatingTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RatingTransaction_matchId_userId_seasonId_key" ON "RatingTransaction"("matchId", "userId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordNotification_dedupeKey_key" ON "DiscordNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "DiscordNotification_status_idx" ON "DiscordNotification"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DiscordAccount" ADD CONSTRAINT "DiscordAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteamAccount" ADD CONSTRAINT "SteamAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PugSession" ADD CONSTRAINT "PugSession_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PugParticipant" ADD CONSTRAINT "PugParticipant_pugId_fkey" FOREIGN KEY ("pugId") REFERENCES "PugSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PugParticipant" ADD CONSTRAINT "PugParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_pugId_fkey" FOREIGN KEY ("pugId") REFERENCES "PugSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftRoom" ADD CONSTRAINT "DraftRoom_pugId_fkey" FOREIGN KEY ("pugId") REFERENCES "PugSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftParticipant" ADD CONSTRAINT "DraftParticipant_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSelection" ADD CONSTRAINT "DraftSelection_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftBan" ADD CONSTRAINT "DraftBan_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DraftRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDraftLink" ADD CONSTRAINT "ExternalDraftLink_pugId_fkey" FOREIGN KEY ("pugId") REFERENCES "PugSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_pugId_fkey" FOREIGN KEY ("pugId") REFERENCES "PugSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatistic" ADD CONSTRAINT "PlayerStatistic_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingTransaction" ADD CONSTRAINT "RatingTransaction_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
