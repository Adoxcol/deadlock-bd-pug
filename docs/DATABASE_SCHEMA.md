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
