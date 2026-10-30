# Rating algorithm — Team Elo
- Team strength = mean rating of its players. Expected score `E = 1 / (1 + 10^((R_opp − R_team)/400))`.
- Every winner gains `round(K·(1−E_w))`, every loser loses the same amount. K = season `kFactor` (default 24); players with < 10 rated games use provisional K = 40.
- Individual K/D/A is **never** an input.
- Only results with source `API`, or `MANUAL` with a verifying moderator, are rated. `SIMULATED` results are rated only inside simulation seasons.
- Idempotent: `MatchResult.matchId` unique + `RatingTransaction(matchId,userId,seasonId)` unique, inside a serializable transaction.
- Season reset: a new season starts every player at `initialRating`; old seasons are archived with their ratings intact.
