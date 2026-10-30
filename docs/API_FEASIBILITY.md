# API Feasibility — Deadlock PUG Platform

_Researched 2026-10-30. Method: source inspection of `github.com/deadlock-api/deadlock-api` (MIT, monorepo: `api/`, `live-events/`, `workers/`).
`api.deadlock-api.com` and `deadlocklabs.gg` were **not reachable from the research sandbox** (egress blocked), so hosted
behaviour was not exercised live. Everything marked "Confirmed (source)" is verified from the published code/docs, not from a live call._

Legend: ✅ Confirmed (source) · ⚠️ Unverified / conditional · ❌ Unsupported

## 1. Identifier glossary — do not confuse these

| Identifier | Origin | Format | Resolves to Match ID? |
|---|---|---|---|
| **Party ID** | Deadlock Game Coordinator party (private lobby is a party with `is_private_lobby=true`) | u64 | ⚠️ Only via `GET /v1/matches/custom/{party_id}/match-id`, which reads a Redis key populated **only for parties the deadlock-api bot created** (`POST /v1/matches/custom/create`) |
| **Party code** | Short join code shown in-game for a party | short alphanumeric string | ❌ No public lookup endpoint |
| **Lobby ID** | GC lobby (the server session once a match is starting) | u64 | ⚠️ Returned *alongside* a match by `/v1/matches/{match_id}/live/url` and active-match data; **no endpoint accepts a lobby ID as input** |
| **Match ID** | Assigned when the game starts | u64 | It *is* the canonical key for metadata, live URL, live events |
| **Draft room code** | Our app / Deadlock Labs / others | provider-specific | Unrelated to the game |

**Conclusion: an existing private custom lobby created in-game by a player cannot be tracked using only its lobby ID or party code.**
Tracking is reliable when either (a) the lobby is created through deadlock-api's bot (we get `party_id` + callback with match ID), or
(b) a moderator supplies the Match ID (visible in-game / post-match).

## 2. Deadlock API (`api.deadlock-api.com`)

| Feature | Status | Endpoint / evidence | Auth | Rate limit (from source) | Recommended approach |
|---|---|---|---|---|---|
| Create custom lobby | ✅ | `POST /v1/matches/custom/create` — bot creates private party, returns `party_id`, `party_code`, optional `callback_secret`. Options: region, game_mode, min_roster_size, randomize_lanes, is_publicly_visible, cheats, duplicate_heroes, `disable_auto_ready`, `callback_url` | Optional API key (`X-API-Key`) | 10/h per IP, 100/30min per key, 1000/h global | **Preferred path.** Offer "Create lobby via Deadlock API" on PUG; store party_id; receive match-start callback (verify `X-Callback-Secret`) |
| Ready / unready / start / leave | ✅ | `POST /v1/matches/custom/{lobby_id}/ready|unready|start|leave` | same | same | Moderator buttons |
| Bot timeout | ✅ limitation | "bot will leave the match 15 minutes after creation" | — | — | Create lobby only once draft completes |
| Party ID → Match ID | ⚠️ | `GET /v1/matches/custom/{party_id}/match-id` reads Redis `{party_id}:match-id` | none | 100/s per IP | Poll after start for API-created parties only; else manual |
| Lobby ID → Match ID | ❌ | no endpoint | — | — | Manual Match ID entry |
| Active match discovery | ⚠️ | `GET /v1/matches/active` — "watch tab, limited to **top 200 matches**"; filter by `account_id(s)` | none | default | Private customs are very unlikely to appear; use only as a best-effort search by linked Steam IDs |
| Match metadata / final stats | ✅ (public matches) ⚠️ (private customs) | `GET /v1/matches/{match_id}/metadata` (`CMsgMatchMetaDataContents`) — requires salts to be known/ingested | none | default | Poll with backoff after match end; if 404 for N hours → "Match data pending" → moderator manual result |
| Player match history | ✅ | `GET /v1/players/{account_id}/match-history` | none | default | Profile enrichment only |
| Live broadcast URL | ✅ | `GET /v1/matches/{match_id}/live/url` returns broadcast URL + `lobby_id` | key optional | anon: 6/h per IP; key: 10/10min, 50/h | Never call per browser; one backend subscription |
| Hero data/assets | ✅ | `GET /v1/assets/heroes` (assets API) | none | default | Seed hero roster; cache; portraits served by upstream CDN — check licence, fallback to initials |
| Hero bans in public stats | ✅ | `/v1/analytics/hero-ban-stats` | none | default | Not needed for PUG |
| API keys | ✅ | `X-API-Key` header (UUID), via Patreon tier | — | raises limits | Store server-side only (`DEADLOCK_API_KEY`) |

## 3. Live Events (`live-events/`, SSE)

Endpoint: `GET /v1/matches/{match_id}/live/demo/events` (SSE, named events). Input is **Match ID only**. Works by spectating the
GC broadcast → so it is subject to the live/url spectate quota and to whatever the GC allows to be spectated.

| Data | Status | Source |
|---|---|---|
| Match duration / pauses | ✅ | `game_rules_proxy`: `game_start_time`, `game_paused`, `total_paused_ticks`; each event has `game_time` |
| Players (steam_id, name, team) | ✅ | `player_controller` |
| Hero selection | ✅ | `player_controller.hero_id` |
| Hero bans | ✅ | `banned_heroes` event (`banned_hero_ids`) |
| K / D / A, net worth, hero damage | ✅ | `player_controller` |
| "Souls" | ⚠️ | net worth is exposed; unspent souls not documented → show net worth, mark souls unavailable |
| Team score | ✅ | `team.score` |
| Objectives | ✅ | `destroyable_building`, `boss_tier2/3`, `mid_boss`, `trooper_barrack_boss` health → infer destruction on `_deleted` / health 0 |
| Kill feed | ✅ | `hero_killed` |
| Match completion | ✅ | `end` event |
| Positions | ✅ | `player_pawn.position` — **competitive-integrity risk**; never forwarded to public clients |
| Spectator delay | ⚠️ | not documented; broadcast is inherently delayed (Source 2 tv_delay). Display "delay unknown" + our own configurable public delay |
| Private custom matches | ⚠️ **Unverified** | depends on whether GC returns a broadcast for private lobbies. Lobby create option `is_publicly_visible` exists — recommend setting it true for tracked PUGs. Must be tested with a real match |
| Hosted vs self-hosted | ✅ | Docker image `ghcr.io/deadlock-api/deadlock-live-events:latest`, port 3000, optional `DEADLOCK_API_KEY`. Hosted URL not verified → configure via `LIVE_EVENTS_URL` |

## 4. Deadlock Labs draft (`deadlocklabs.gg/draft-pick/`)

Site unreachable from sandbox; no public documentation of an API, WebSocket, webhook, embed policy or export format was found.
| Capability | Status | Approach |
|---|---|---|
| Public API / WebSocket / webhook | ❌ none documented | Do not reverse-engineer |
| Embedding (iframe) | ⚠️ unknown, assume **not allowed** | "Open Draft" button (new tab) |
| Room identifiers / shareable link | ⚠️ | Store the URL the moderator pastes |
| Export results | ❌ undocumented | Manual import form (picks/bans per team) |

## 5. Open-source projects

| Repo | Licence | Reuse |
|---|---|---|
| zak123/DeadlockDraft | MIT (abandoned → statlocker.gg/draft) | Pattern only: lobby code + WS sync + Steam OpenID. React/Hono — no direct code reuse |
| AzzyDreamer/deadlock-drafting-overlay | **No licence file** → all rights reserved | Do **not** copy code. Idea reused: OBS browser-source overlay → our `/draft/:id/spectate?broadcast=1` |
| deadlock-api/deadlock-api | MIT | Self-host live-events; event schema used for our normalizer |

## 6. End-to-end workflow feasibility

| # | Step | Verdict |
|---|---|---|
| 1 | Moderator creates draft room | **Fully automated** (native) |
| 2 | 12 players join | **Automated** (Discord login; captains act, others watch) |
| 3 | Captains pick/ban | **Automated**, server-authoritative |
| 4 | Spectators watch live | **Automated** (WebSocket) |
| 5 | Draft finishes | **Automated** + Discord notification |
| 6 | Custom match begins | **Semi-automated**: optional lobby via deadlock-api bot (verified endpoint, untested live); else players create it in-game |
| 7 | Moderator enters lobby/Match ID | Match ID ✅; party ID ⚠️ (API-created only); lobby ID ❌ → **moderator intervention** |
| 8 | Connect match to draft | **Automated** once Match ID known (PUG ↔ draft ↔ match FK) |
| 9 | Live stats | ⚠️ **Requires live verification** for private customs; graceful "Live tracking unavailable" state |
| 10 | Match finishes | ✅ via `end` SSE event or callback; else moderator marks complete |
| 11 | Final stats | ⚠️ metadata for private customs unverified → "Match data pending" → moderator manual result (flagged "Manually verified") |
| 12 | Leaderboard updates | **Automated**, idempotent, only for verified results |
| 13 | Discord publishes | **Automated** |

## 7. Actions required before Phase 3
1. Allow `api.deadlock-api.com` (and optionally `deadlocklabs.gg`) in the deployment network.
2. Run one real private custom match: test `/custom/create` → callback → `/metadata` → `/live/url` → live-events SSE. Record results here.
3. Request an API key if spectate quotas are insufficient.
