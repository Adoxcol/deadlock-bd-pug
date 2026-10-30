# Deadlock Bangladesh — PUG Platform
Native live drafting, match tracking, leaderboards and Discord integration for a Deadlock PUG community.

Read first: [`docs/API_FEASIBILITY.md`](docs/API_FEASIBILITY.md) — what the Deadlock APIs can and cannot do.

## Stack
Vue 3 + Vite + Tailwind + Pinia · Fastify + WebSocket · PostgreSQL/Prisma · Redis · discord.js. Modular monolith (`apps/server`, `apps/web`).

## Local development
```bash
npm install
cp .env.example apps/server/.env   # set SESSION_SECRET, DATABASE_URL, REDIS_URL, SIMULATION_MODE=true
cd apps/server && npx prisma migrate deploy && cd ../..
npm run dev                        # api :3001, web :5173 (proxied)
```
With `SIMULATION_MODE=true`, use the development login and **Run simulated PUG** on the dashboard: it drives a full
PUG → draft → live match → result → leaderboard cycle. All simulated rows are flagged and badged in the UI.

## A PUG night, end to end
1. **Create lobby** (Drafts) → share the 6-letter code. Captains take seats and ready up; players join their team.
2. Ban and pick. When the draft is complete, captains assign each hero to a player.
3. A captain clicks **Create Deadlock lobby**. Players join in Deadlock with the party code shown (Play → Custom), pick their assigned heroes and start within 15 minutes.
4. The website detects the match (webhook on a public HTTPS deployment, otherwise polling every 15s) and links it to the draft and PUG.
5. Live stats appear if deadlock-api provides them for the match; otherwise a moderator submits the result on the match page.
6. Ratings, leaderboard and Discord update.

If the bot can't be used (rate limit, outage), create the lobby in-game and a moderator enters the Match ID in **Tracker**.

## Tests
```bash
npm test
```
Optional database integration tests: `TEST_DATABASE_URL=postgresql://… npm test` (use a disposable, migrated database).

Covers the draft engine (turn order, pick/ban validation, timers, pause/resume, corrections), concurrency, WS broadcast/reconnect,
identifier classification, match ID resolution (mocked API), live-event normalization/dedupe, Elo, idempotent results, permissions.

## Production (Docker)
```bash
cp .env.example .env   # fill in
docker compose up -d --build              # add --profile live to run deadlock live-events locally
```
Caddy terminates TLS and serves the SPA; `/api` and `/ws` go to the app. Health: `GET /api/health`.
