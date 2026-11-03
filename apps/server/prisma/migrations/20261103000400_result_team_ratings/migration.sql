-- Average team ratings at result time, used for the underdog points bonus.
ALTER TABLE "MatchResult" ADD COLUMN "amberRating" INTEGER, ADD COLUMN "sapphireRating" INTEGER;
