# Architecture

Modular monolith, npm workspaces:

```
apps/server   Fastify + @fastify/websocket + Prisma + ioredis + discord.js (optional)
apps/web      Vue 3 + Vite + Tailwind + Pinia + Vue Router + lucide-vue-next
packages/shared  Types shared by both (draft state, WS messages, statuses)
```

## Modules (server)
| Module | Responsibility |
|---|---|
| `auth` | Discord OAuth2, Steam OpenID 2.0 (verify via `check_authentication`), signed httpOnly session cookie, CSRF via double-submit header on mutating requests |
| `rbac` | Roles Owner > Admin > Moderator > Captain > Player > Spectator; `requireRole()` preHandler |
| `draft` | **Pure engine** (`engine.ts`: state + action → new state or error) + `DraftService` (lock, persist, broadcast, timers) |
| `draft/providers` | `DraftProvider` interface; `NativeDraftProvider` (full), `LinkOnlyProvider` (Deadlock Labs / external: associate URL + manual import) |
| `realtime` | WS hub with topic subscriptions (`dashboard`, `draft:<id>`, `match:<id>`); auth from session cookie on upgrade |
| `tracker` | Identifier classification + resolution chain (Match ID → party ID lookup → manual) |
| `live` | One SSE subscription per match → normalizer (dedupe by `(entity,index,tick)`, drop out-of-order ticks) → Redis cached state → WS (public view delayed + redacted) |
| `results` | Idempotent result processing (`MatchResult` unique per match; rating transactions unique per (match, player)) |
| `rating` | Team Elo (pure) |
| `discord` | Bot commands + notification outbox (`DiscordNotification` rows; dedupe key) |
| `sim` | Development simulator (`SIMULATION_MODE=true`) — all generated rows flagged `isSimulated` |

## Draft concurrency
Every action: acquire `lock:draft:<id>` (Redis `SET NX PX`, in-memory fallback in dev/test) → load state → `engine.apply()` →
transaction (insert `DraftAction` with unique `(draftId, seq)`; update room) → release → broadcast full state with `serverNow`.
Client sends `expectedSeq`; mismatch → rejected (prevents double action per turn). Timer: state stores `turnEndsAt` (server epoch ms);
clients render `turnEndsAt - (Date.now() + clockOffset)`. Server-side scheduler fires timeout → configured behaviour (`random` / `skip`
/ `pause`). On restart, timers are re-armed from DB.

## Live pipeline
`Deadlock live-events SSE → LiveIngestor (1 per match, leader-elected via Redis lock) → normalized MatchState → Redis → WS`.
Public scoreboard: delayed by `PUBLIC_DELAY_SEC`, no positions, no net worth until delay passes. Moderators get the full view.
State is marked `stale` if no event for 15s.
