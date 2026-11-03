-- Detailed per-player match stats (null = not published for this match).
ALTER TABLE "PlayerStatistic" ADD COLUMN "details" JSONB;
