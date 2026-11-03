ALTER TABLE "SteamAccount" ADD COLUMN "gameRank" INTEGER;
ALTER TABLE "SteamAccount" ADD COLUMN "gameSubrank" INTEGER;
ALTER TABLE "SteamAccount" ADD COLUMN "gameRankPoints" INTEGER;
ALTER TABLE "SteamAccount" ADD COLUMN "lastRankedAt" TIMESTAMP(3);
ALTER TABLE "SteamAccount" ADD COLUMN "rankCheckedAt" TIMESTAMP(3);
