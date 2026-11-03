# Database Schema
Source of truth: `apps/server/prisma/schema.prisma`. Highlights:
- Internal IDs are `cuid`; external IDs (`discordId`, `steamId64`, `deadlockMatchId`, `partyId`) are separate unique columns.
- **Snapshots:** `MatchParticipant.displayNameSnapshot`, `DraftParticipant.displayNameSnapshot`, `heroNameSnapshot` keep history stable.
- **Idempotency:** `MatchResult.matchId @unique`; `RatingTransaction @@unique([matchId, userId, seasonId])`; `DraftAction @@unique([draftId, seq])`; `MatchEvent @@unique([matchId, dedupeKey])`; `DiscordNotification.dedupeKey @unique`.
- **Provenance:** `MatchResult.source` = `API | MANUAL | SIMULATED`; `verifiedById`. Ratings only applied when `verified=true && source != SIMULATED` (unless season `isSimulated`).
- `AuditLog(actorId, action, entityType, entityId, before JSON, after JSON, createdAt)` on every privileged mutation.
Tables: User, DiscordAccount, SteamAccount, Guild, PugSession, PugParticipant, Team, DraftRoom, DraftParticipant, DraftAction,
DraftSelection, DraftBan, ExternalDraftLink, Match, MatchParticipant, MatchEvent, MatchResult, PlayerStatistic, PlayerRating,
RatingTransaction, Season, DiscordNotification, AuditLog, Hero.


`PugSession.formation` stores the optional authoritative team-formation snapshot (captains, player pool, toss outcome, sides, consent, pick history, and resulting draft ID). `formationSeq` is the optimistic concurrency version. Existing PUGs have a null formation and retain manual behavior. Formation actions and snapshots are recorded in `AuditLog` in the same transaction as roster changes.

`PugSession.name`, `code` and `settings` hold the optional lobby name, share code and hero draft rules. `PugInvite` stores invite tokens per role in a separate table, so returning a PUG never exposes them.

## Detailed player stats
`PlayerStatistic.details` (JSON, nullable) holds level, last hits, denies, damage and healing totals, soul sources, item timeline and souls/damage timeline, normalized from `GET /v1/matches/{id}/metadata` by `tracker/matchStats.ts`. Null means not published for that match; an individual value the API did not send is also null, never 0. Importing fills existing rows only and never creates a result or changes ratings. `objectiveDamage` is `boss_damage` and `healing` is `player_healing + player_barriering - self_damage`; both match the in-game scoreboard for all 12 players of match 129343601.

## Match replays
`MatchReplay.data` (JSON) holds per-second positions and health plus deaths, objectives, Mid Boss and pauses, normalized by `tracker/replay.ts`. It is fetched the first time a replay is opened and kept in its own table so match queries stay small.
