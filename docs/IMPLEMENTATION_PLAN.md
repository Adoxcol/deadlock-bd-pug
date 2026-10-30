# Implementation Plan
| Phase | Scope | State |
|---|---|---|
| 0 | Research + docs | ✅ done (live verification of private customs still outstanding — see API_FEASIBILITY §7) |
| 1 | Monorepo, Prisma schema, auth (Discord/Steam), RBAC, dashboard, WS hub | ✅ implemented |
| 2 | Native draft engine, timers, WS sync, spectator/broadcast view, history, Discord notifications | ✅ implemented (engine fully tested) |
| 2a | Lobby workflow modelled on docs/deadlock-draft-tool-analysis.md: 6-char room codes (`/d/:code`), captain seats + ready-up auto-start, swap sides, split ban phases (6v6), skip ban, hover-aware ban timeout, copy result, rematch vote (new room, same code — old draft kept), player team join + post-draft hero assignment | ✅ implemented, e2e-tested with 3 browsers |
| 2b | Simulator (draft + match events, flagged) | ✅ implemented |
| 3 | Tracker: identifier classification, Match ID / party resolution, live ingestion | Partial: classification + resolution client + normalizer implemented & tested; SSE ingestor implemented but untested against real match |
| 4 | Results, team Elo, leaderboard, seasons | Partial: rating engine + idempotent processing implemented; season admin UI pending |
| 5 | External draft links + manual import, broadcast overlays | Link provider + import API done; UI pending |
Next: verify live endpoints with a real custom match; build admin season/rating config UI; Discord channel config UI.
