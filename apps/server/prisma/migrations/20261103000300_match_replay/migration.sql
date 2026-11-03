-- Position and event data for the replay page; a separate table keeps it out of match queries.
CREATE TABLE "MatchReplay" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchReplay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchReplay_matchId_key" ON "MatchReplay"("matchId");

ALTER TABLE "MatchReplay" ADD CONSTRAINT "MatchReplay_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
