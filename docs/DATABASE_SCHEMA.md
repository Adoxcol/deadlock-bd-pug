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
