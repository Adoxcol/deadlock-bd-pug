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

## Tests
```bash
npm test
```
Covers the draft engine (turn order, pick/ban validation, timers, pause/resume, corrections), concurrency, WS broadcast/reconnect,
identifier classification, match ID resolution (mocked API), live-event normalization/dedupe, Elo, idempotent results, permissions.

## Production (Docker)
```bash
cp .env.example .env   # fill in
docker compose up -d --build              # add --profile live to run deadlock live-events locally
```
Caddy terminates TLS and serves the SPA; `/api` and `/ws` go to the app. Health: `GET /api/health`.
