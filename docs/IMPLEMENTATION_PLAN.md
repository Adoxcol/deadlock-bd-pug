# Implementation Plan
| Phase | Scope | State |
|---|---|---|
| 0 | Research + docs | ✅ done (live verification of private customs still outstanding — see API_FEASIBILITY §7) |
| 1 | Monorepo, Prisma schema, auth (Discord/Steam), RBAC, dashboard, WS hub | ✅ implemented |
| 2 | Native draft engine, timers, WS sync, spectator/broadcast view, history, Discord notifications | ✅ implemented (engine fully tested) |
| 2b | Simulator (draft + match events, flagged) | ✅ implemented |
| 3 | Tracker: identifier classification, Match ID / party resolution, live ingestion | Partial: classification + resolution client + normalizer implemented & tested; SSE ingestor implemented but untested against real match |
| 4 | Results, team Elo, leaderboard, seasons | Partial: rating engine + idempotent processing implemented; season admin UI pending |
| 5 | External draft links + manual import, broadcast overlays | Link provider + import API done; UI pending |
Next: verify live endpoints with a real custom match; build admin season/rating config UI; Discord channel config UI.
