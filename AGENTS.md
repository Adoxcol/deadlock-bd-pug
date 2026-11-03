# AGENTS.md

A guide for anyone (people or AI coding agents) working on **Deadlock PUG Bangladesh**: a self-hosted platform for a Deadlock pick-up-game community with live hero drafts, Deadlock custom-lobby creation, match tracking, team Elo leaderboards and a Discord bot.

## Read first

| Doc | Why |
|---|---|
| `docs/API_FEASIBILITY.md` | What the Deadlock APIs can and **cannot** do. Check here before building anything that relies on them |
| `docs/ARCHITECTURE.md` | Modules, draft concurrency, live pipeline |
| `docs/UI.md` | Design system. **Required before touching any page** |
| `docs/DATABASE_SCHEMA.md` | Idempotency and snapshot rules |
| `docs/RATING.md` | Team Elo |
| `docs/deadlock-draft-tool-analysis.md` | The draft workflow the native draft is modelled on (behaviour only) |

## Layout

```
apps/server   Fastify + WebSocket + Prisma (Postgres) + Redis + discord.js; also serves the built website in production
  src/draft/      engine.ts (pure rules), service.ts (locks, timers, broadcast), providers.ts
  src/lobby/      Deadlock custom lobbies via the deadlock-api bot (create, webhook, polling)
  src/tracker/    identifier classification, deadlock-api client
  src/live/       live-events SSE ingestion + normalisation
  src/results/    idempotent result processing → rating
  src/discord/    bot commands, notification outbox
  src/sim/        development simulator
  prisma/         schema + migrations
  test/           vitest (unit; *.integration.test.ts need TEST_DATABASE_URL)
apps/web      Vue 3 + Vite + Tailwind + Pinia
  src/pages/      one file per route (see src/main.ts)
  src/components/ shared UI (see docs/UI.md §4)
```

## Commands

```bash
npm install
npm run dev                         # server :3001 + web :5173 (needs Postgres + Redis, see README)
npm test                            # server unit tests, no network or DB needed
TEST_DATABASE_URL=postgresql://… npm test        # also runs the Postgres integration tests
cd apps/server && npx tsc --noEmit  # typecheck the server
cd apps/web && npx vue-tsc --noEmit # typecheck the web app
cd apps/server && npx prisma migrate dev --name <change>   # after editing schema.prisma
```

Before you say you're done, all of these must pass: both typechecks, `npm test`, and `cd apps/web && npx vite build`. For UI changes, also look at the page at **390px and desktop width**.

Use `SIMULATION_MODE=true` locally: it enables a dev login (pick any role) and "Run simulated PUG", which plays a whole PUG with flagged fake data.

## Rules that matter

**Third-party APIs**
- **Don't invent API capabilities.** Anything that uses deadlock-api must be verified, in its source or docs, and recorded in `docs/API_FEASIBILITY.md`. Mark unverified behaviour as unverified in code comments and in the UI.
- Browsers never call third-party APIs for game data; the server does it once and caches. The exception is images and audio loaded by URL.
- Deadlock Labs has no API. Link to it and import results manually; never scrape it or reverse-engineer it.

**Integrity**
- The server is authoritative for drafts: every action goes through `draft/engine.ts` (pure) under a lock with `expectedSeq`. Never trust client state.
- Results and ratings are **idempotent**: unique constraints plus a transaction. Processing a match twice must change nothing.
- **Never award rating from unverified or simulated results** (except inside a simulation season).
- Every privileged action is checked server-side (`requireRole`) and written to `AuditLog`.
- Simulated data is always flagged (`isSimulated`, `[SIM]` names, `SimBadge`) and never mixed silently with real data.

**Privacy and secrets**
- Party codes, webhook secrets, API keys and tokens never reach spectators or the browser. Use `publicMatch()` / `DraftService.publicView()` when returning rows. The hovered hero stays server-side.
- No secrets in the repo; use `.env` (documented in `.env.example`).

**Assets and IP**
- No Valve/Deadlock artwork, audio or fonts, and no other site's branding, in the repo. Load hero images and voicelines from deadlock-api at runtime; the one exception is the hero-select renders, loaded at runtime from JustGDX/DeadlockWiki through jsDelivr. Our own crests, logo and sounds are made in code.
- Check a project's licence before copying any of its code (e.g. `AzzyDreamer/deadlock-drafting-overlay` has no licence, so don't copy from it).

**Code style**
- TypeScript strict. Match the surrounding code's density and naming. Keep comments for *why*, not *what*.
- Reuse the components and tokens in `docs/UI.md` instead of one-off styling. Use `UiSelect`, not `<select>`.
- Don't add dependencies without a clear reason.
- Commit messages: imperative subject, a body that explains why.

## Gotchas

- Postgres and Redis in a fresh dev container may need starting (`service postgresql start`, `redis-server --daemonize yes`).
- Live tracking state is in memory; on startup the server resumes real live matches and closes out simulated ones.
- The deadlock-api lobby bot leaves 15 minutes after creating a lobby, and lobby creation is limited to about 10 per hour per IP without an API key.
- The lobby webhook only works when `PUBLIC_URL` is public HTTPS; otherwise the server polls every 15 seconds.
