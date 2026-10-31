import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, type User } from '@prisma/client';
import { Redis } from 'ioredis';
import type { Config } from './config.js';
import { Hub } from './realtime/hub.js';
import { DraftService } from './draft/service.js';
import { DraftError, TEAM_SIZE } from './draft/engine.js';
import { RedisLock, MemoryLock, LockBusyError } from './draft/lock.js';
import { PrismaDraftStore, syncHeroes } from './db/draftStore.js';
import { PrismaResultsRepo } from './db/resultsRepo.js';
import { audit } from './db/audit.js';
import { processResult } from './results/process.js';
import { RedisSessionStore, MemorySessionStore, type SessionStore } from './auth/session.js';
import { atLeast, canAssignRole, type Role, ROLES } from './auth/rbac.js';
import { discordAuthorizeUrl, exchangeDiscordCode } from './auth/discord.js';
import { steamLoginUrl, verifySteamAssertion, steam64ToAccountId } from './auth/steam.js';
import { fetchHeroes, BUILTIN_HEROES, type Hero } from './heroes.js';
import { createDeadlockApi } from './tracker/deadlockApi.js';
import { resolveIdentifier } from './tracker/resolve.js';
import { LiveManager } from './live/ingestor.js';
import { simulateMatch } from './sim/simulator.js';
import { Notifier, COLORS, type Sender } from './discord/notifier.js';
import { providers, validateImport } from './draft/providers.js';
import { LobbyService, LobbyError } from './lobby/service.js';
import { parseCallbackMatchId, verifyCallbackSecret } from './lobby/callback.js';
import type { DraftCommand, TeamSide } from './draft/types.js';

declare module 'fastify' { interface FastifyRequest { user: User | null; sessionId: string | null } }

const SESSION_COOKIE = 'dbd_sid';
const toSide = (t: TeamSide): 'AMBER' | 'SAPPHIRE' => (t === 'amber' ? 'AMBER' : 'SAPPHIRE');

export async function buildApp(cfg: Config, opts: { discordSender?: Sender | null } = {}) {
  const app = Fastify({ logger: { level: cfg.NODE_ENV === 'test' ? 'silent' : 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] }, trustProxy: cfg.TRUST_PROXY });
  const db = new PrismaClient();
  const redis = cfg.REDIS_URL ? new Redis(cfg.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 }) : null;
  if (!redis && cfg.NODE_ENV === 'production') throw new Error('REDIS_URL is required in production');
  const sessions: SessionStore = redis ? new RedisSessionStore(redis) : new MemorySessionStore();
  const hub = new Hub();
  const api = createDeadlockApi(cfg.DEADLOCK_API_URL, cfg.DEADLOCK_API_KEY);

  // ---------- Heroes ----------
  let heroes: Hero[] = [];
  let heroSource: 'deadlock-api' | 'database' | 'builtin' = 'builtin';
  async function loadHeroes() {
    try { heroes = await fetchHeroes(cfg.DEADLOCK_API_URL); heroSource = 'deadlock-api'; await syncHeroes(db, heroes); return; }
    catch (e) { app.log.warn(`hero assets unavailable: ${(e as Error).message}`); }
    const stored = await db.hero.findMany({ where: { isActive: true } });
    if (stored.length) { heroes = stored.map((h) => ({ id: h.id, name: h.name, imageUrl: h.imageUrl, simulated: false })); heroSource = 'database'; return; }
    // Real IDs and names, no portraits; refreshed from the assets API as soon as it is reachable (Admin → Refresh).
    heroes = BUILTIN_HEROES; heroSource = 'builtin';
    app.log.warn('Using the built-in hero roster (no portraits) until the Deadlock assets API is reachable.');
  }
  await loadHeroes();
  // Keep trying for portraits and newly released heroes until the assets API answers, then refresh daily.
  const scheduleHeroRefresh = () => setTimeout(() => void loadHeroes().catch(() => {}).finally(scheduleHeroRefresh), (heroSource as string) === 'deadlock-api' ? 24 * 3600_000 : 10 * 60_000).unref();
  scheduleHeroRefresh();
  const heroName = (id: number) => heroes.find((h) => h.id === id)?.name ?? `Hero ${id}`;

  // ---------- Discord ----------
  const channelFor = async () => (await db.guild.findFirst())?.announceChannelId ?? null;
  const notifier = new Notifier(db, opts.discordSender ?? null, channelFor);
  setInterval(() => void notifier.flush().catch((e) => app.log.error(e)), 5000).unref();

  // ---------- Draft ----------
  const store = new PrismaDraftStore(db, heroName);
  const drafts = new DraftService(store, redis ? new RedisLock(redis) : new MemoryLock(), hub, () => heroes.map((h) => h.id), (event, rec) => {
    const s = rec.state;
    const list = (t: TeamSide) => s.picks[t].map(heroName).join(', ') || '—';
    void notifier.enqueue(event, `${event}:${rec.id}`, event === 'draft.started'
      ? { title: `Draft started: ${rec.name}`, url: `${cfg.PUBLIC_URL}/draft/${rec.id}/spectate`, color: COLORS.purple }
      : { title: `Draft complete: ${rec.name}`, url: `${cfg.PUBLIC_URL}/draft/${rec.id}`, color: COLORS.purple, fields: [
        { name: rec.teamNames.amber, value: list('amber'), inline: true }, { name: rec.teamNames.sapphire, value: list('sapphire'), inline: true },
        { name: 'Bans', value: [...s.bans.amber, ...s.bans.sapphire].map(heroName).join(', ') || 'None' }] }, rec.simulated);
    if (rec.pugId) void db.pugSession.update({ where: { id: rec.pugId }, data: { status: event === 'draft.started' ? 'DRAFTING' : 'WAITING' } }).catch(() => {});
  });
  await drafts.restore();

  // ---------- Live ----------
  const live = new LiveManager(hub, cfg.LIVE_EVENTS_URL, cfg.PUBLIC_LIVE_DELAY_SEC, (id, s) => {
    void db.match.update({ where: { id }, data: { trackingState: s.simulated ? 'MATCH_COMPLETED' : 'MATCH_DATA_PENDING', endedAt: new Date(), durationSec: s.gameTime ? Math.round(s.gameTime) : null } }).catch(() => {});
    hub.publish('dashboard', 'match.updated', { id });
  });

  /** A Deadlock match is known to be running for this row: start live tracking and tell everyone. Idempotent. */
  async function onMatchStarted(matchRowId: string) {
    let m = await db.match.findUniqueOrThrow({ where: { id: matchRowId } });
    if (!m.deadlockMatchId) return;
    if (!['LIVE_AVAILABLE', 'LIVE_UNAVAILABLE', 'MATCH_COMPLETED', 'MATCH_DATA_PENDING'].includes(m.trackingState)) {
      const started = live.start(m.id, m.deadlockMatchId);
      m = await db.match.update({ where: { id: m.id }, data: {
        trackingState: started ? 'LIVE_AVAILABLE' : 'LIVE_UNAVAILABLE', startedAt: m.startedAt ?? new Date(),
        trackingNote: started ? 'Subscribed to live-events. Data for private custom matches is unverified and may not arrive.' : 'LIVE_EVENTS_URL not configured — live stats unavailable. Submit the result when the match ends.',
      } });
      await notifier.enqueue('match.started', `match.started:${m.id}`, { title: `Match ${m.deadlockMatchId} started`, url: `${cfg.PUBLIC_URL}/matches/${m.id}/live`, color: COLORS.teal }, m.isSimulated);
    }
    if (m.pugId) await db.pugSession.update({ where: { id: m.pugId }, data: { status: 'LIVE' } }).catch(() => {});
    if (m.draftId) {
      hub.publish(`draft:${m.draftId}`, 'draft.match', { matchId: m.id });
      hub.publish(`draft:${m.draftId}`, 'draft.lobby', { ...lobbies.view(m), partyCode: null, partyId: null });
    }
    hub.publish('dashboard', 'match.updated', { id: m.id });
  }
  /** Match rows hold the party code (lets anyone into the game) and the webhook secret hash: never send those. */
  const publicMatch = <T extends { partyCode?: string | null; callbackSecretHash?: string | null; lobbyCreatedById?: string | null }>(m: T) => {
    const { partyCode: _c, callbackSecretHash: _h, lobbyCreatedById: _u, ...rest } = m; return rest;
  };
  // Live tracking is in memory: after a restart, resume real matches and close out simulated ones (they can't resume).
  for (const m of await db.match.findMany({ where: { trackingState: 'LIVE_AVAILABLE' } })) {
    if (m.isSimulated || !m.deadlockMatchId) {
      await db.match.update({ where: { id: m.id }, data: { trackingState: 'LIVE_UNAVAILABLE', trackingNote: 'Live tracking stopped when the server restarted.' } });
    } else if (!live.start(m.id, m.deadlockMatchId)) {
      await db.match.update({ where: { id: m.id }, data: { trackingState: 'LIVE_UNAVAILABLE', trackingNote: 'LIVE_EVENTS_URL not configured — live stats unavailable.' } });
    }
  }
  const lobbies = new LobbyService(db, api, { publicUrl: cfg.PUBLIC_URL, region: cfg.DEADLOCK_LOBBY_REGION, log: app.log }, onMatchStarted);
  lobbies.start();

  // ---------- Plugins ----------
  await app.register(cookie, { secret: cfg.SESSION_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', ...(redis ? { redis } : {}) });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });
  // deadlock-api's callback body format is undocumented; accept plain text as well as JSON.
  app.addContentTypeParser('text/plain', { parseAs: 'string', bodyLimit: 4096 }, (_req, body, done) => done(null, body));

  async function loadUser(req: FastifyRequest) {
    req.user = null; req.sessionId = null;
    const raw = req.cookies[SESSION_COOKIE]; if (!raw) return;
    const un = req.unsignCookie(raw); if (!un.valid || !un.value) return;
    const s = await sessions.get(un.value); if (!s) return;
    req.sessionId = un.value;
    req.user = await db.user.findUnique({ where: { id: s.userId } });
  }
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.addHook('onRequest', async (req, reply) => {
    await loadUser(req);
    // CSRF: SameSite=Lax cookie + custom header that cross-site forms cannot set.
    // Webhooks come from servers, carry no cookies, and authenticate with their own secret.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.url.startsWith('/api/') && !req.url.startsWith('/api/webhooks/') && req.headers['x-dbd-csrf'] !== '1') {
      return reply.code(403).send({ error: 'CSRF check failed' });
    }
  });

  const setSession = async (reply: FastifyReply, userId: string) => {
    const id = await sessions.create({ userId, createdAt: Date.now() });
    reply.setCookie(SESSION_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.NODE_ENV === 'production', signed: true, maxAge: 60 * 60 * 24 * 14 });
  };
  const requireRole = (min: Role) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Login required' });
    if (!atLeast(req.user.role as Role, min)) return reply.code(403).send({ error: 'Insufficient permissions' });
  };
  const isMod = (u: User | null) => atLeast(u?.role as Role | undefined, 'MODERATOR');
  const publicUser = (u: User) => ({ id: u.id, displayName: u.displayName, role: u.role, isSimulated: u.isSimulated });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof DraftError) return reply.code(err.code === 'FORBIDDEN' ? 403 : 409).send({ error: err.message, code: err.code });
    if (err instanceof LockBusyError) return reply.code(503).send({ error: err.message });
    if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid input', issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Internal error' : err.message });
  });

  // ---------- Health ----------
  app.get('/api/health', async (_req, reply) => {
    const checks: Record<string, string> = {};
    try { await db.$queryRaw`SELECT 1`; checks.db = 'ok'; } catch { checks.db = 'down'; }
    if (redis) { try { await redis.ping(); checks.redis = 'ok'; } catch { checks.redis = 'down'; } } else checks.redis = 'not configured (memory fallback)';
    checks.heroes = `${heroes.length} (${heroSource})`;
    const ok = checks.db === 'ok' && checks.redis !== 'down';
    return reply.code(ok ? 200 : 503).send({ ok, checks, simulationMode: cfg.SIMULATION_MODE });
  });

  // ---------- Auth ----------
  app.get('/api/me', async (req) => {
    if (!req.user) return { user: null, simulationMode: cfg.SIMULATION_MODE, discordEnabled: !!cfg.DISCORD_CLIENT_ID, discordInvite: cfg.DISCORD_INVITE_URL ?? null };
    const [discord, steam] = await Promise.all([db.discordAccount.findUnique({ where: { userId: req.user.id } }), db.steamAccount.findUnique({ where: { userId: req.user.id } })]);
    return { user: publicUser(req.user), discord: discord && { username: discord.username }, steam: steam && { steamId64: steam.steamId64, personaName: steam.personaName }, simulationMode: cfg.SIMULATION_MODE, discordEnabled: !!cfg.DISCORD_CLIENT_ID, discordInvite: cfg.DISCORD_INVITE_URL ?? null };
  });

  const discordRedirect = `${cfg.PUBLIC_URL}/api/auth/discord/callback`;
  app.get('/api/auth/discord', async (_req, reply) => {
    if (!cfg.DISCORD_CLIENT_ID) return reply.code(503).send({ error: 'Discord login not configured' });
    const state = randomBytes(16).toString('hex'); await sessions.putTemp(`oauth:${state}`, '1', 600);
    return reply.redirect(discordAuthorizeUrl(cfg.DISCORD_CLIENT_ID, discordRedirect, state));
  });
  app.get('/api/auth/discord/callback', async (req, reply) => {
    const q = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    if (!(await sessions.takeTemp(`oauth:${q.state}`))) return reply.code(400).send({ error: 'Invalid OAuth state' });
    const du = await exchangeDiscordCode(q.code, cfg.DISCORD_CLIENT_ID!, cfg.DISCORD_CLIENT_SECRET!, discordRedirect);
    const owners = cfg.OWNER_DISCORD_IDS.split(',').map((s) => s.trim()).filter(Boolean);
    const existing = await db.discordAccount.findUnique({ where: { discordId: du.id } });
    let userId = existing?.userId;
    if (existing) await db.discordAccount.update({ where: { id: existing.id }, data: { username: du.username, avatar: du.avatar } });
    else {
      const u = await db.user.create({ data: { displayName: du.global_name ?? du.username, role: owners.includes(du.id) ? 'OWNER' : 'PLAYER', discord: { create: { discordId: du.id, username: du.username, avatar: du.avatar } } } });
      userId = u.id;
    }
    await setSession(reply, userId!);
    return reply.redirect('/');
  });
  app.get('/api/auth/steam', { preHandler: requireRole('SPECTATOR') }, async (_req, reply) => reply.redirect(steamLoginUrl(`${cfg.PUBLIC_URL}/api/auth/steam/callback`, cfg.PUBLIC_URL)));
  app.get('/api/auth/steam/callback', { preHandler: requireRole('SPECTATOR') }, async (req, reply) => {
    const id64 = await verifySteamAssertion(req.query as Record<string, string>, `${cfg.PUBLIC_URL}/api/auth/steam/callback`);
    if (!id64) return reply.redirect('/profile?steam=failed');
    const taken = await db.steamAccount.findUnique({ where: { steamId64: id64 } });
    if (taken && taken.userId !== req.user!.id) return reply.redirect('/profile?steam=taken');
    await db.steamAccount.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, steamId64: id64, accountId: steam64ToAccountId(id64) }, update: { steamId64: id64, accountId: steam64ToAccountId(id64) } });
    await audit(db, req.user!.id, 'steam.link', 'User', req.user!.id, null, { steamId64: id64 });
    return reply.redirect('/profile?steam=linked');
  });
  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionId) await sessions.destroy(req.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' }); return { ok: true };
  });

  if (cfg.SIMULATION_MODE) {
    // Development only: sign in as a simulated user with a chosen role.
    app.post('/api/dev/login', async (req, reply) => {
      const b = z.object({ name: z.string().min(1).max(32), role: z.enum(ROLES) }).parse(req.body);
      const u = (await db.user.findFirst({ where: { displayName: `[SIM] ${b.name}`, isSimulated: true } })) ?? await db.user.create({ data: { displayName: `[SIM] ${b.name}`, role: b.role, isSimulated: true } });
      if (u.role !== b.role) await db.user.update({ where: { id: u.id }, data: { role: b.role } });
      await setSession(reply, u.id); return { ok: true };
    });
  }

  // ---------- Heroes / Dashboard ----------
  app.get('/api/heroes', async () => ({ source: heroSource, heroes }));

  app.get('/api/dashboard', async () => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [activePugs, members, completedToday, liveMatches, recent, season, pugsPlayed] = await Promise.all([
      db.pugSession.findMany({ where: { status: { in: ['WAITING', 'DRAFTING', 'LIVE'] } }, include: { teams: true, participants: true, draftRooms: { orderBy: { createdAt: 'desc' }, take: 1 }, matches: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { number: 'desc' } }),
      db.user.count({ where: { isSimulated: false } }),
      db.matchResult.count({ where: { createdAt: { gte: startOfDay } } }),
      db.match.count({ where: { trackingState: { in: ['MATCH_DETECTED', 'LIVE_AVAILABLE'] } } }),
      db.matchResult.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { match: { include: { pug: { include: { teams: true } } } } } }),
      db.season.findFirst({ where: { isActive: true } }),
      db.pugSession.count({ where: { status: 'COMPLETED', isSimulated: false } }),
    ]);
    const activeDrafts = await store.listActive();
    const drafting = activeDrafts.filter((d) => d.state.status === 'drafting' || d.state.status === 'paused');
    const top = season ? await db.playerRating.findMany({ where: { seasonId: season.id }, orderBy: { rating: 'desc' }, take: 5, include: { user: true } }) : [];
    return {
      stats: { pugsPlayed, activePugs: activePugs.length, playersDrafting: drafting.reduce((n, d) => n + TEAM_SIZE[d.state.config.format] * 2, 0), matchesLive: liveMatches, completedToday, members },
      sessions: activePugs.map((p) => ({
        id: p.id, number: p.number, status: p.status, players: p.participants.length, format: p.format, isSimulated: p.isSimulated,
        teams: Object.fromEntries(p.teams.map((t) => [t.side.toLowerCase(), t.name])), createdAt: p.createdAt,
        draft: p.draftRooms[0] ? { id: p.draftRooms[0].id, status: p.draftRooms[0].status } : null,
        match: p.matches[0] ? { id: p.matches[0].id, state: p.matches[0].trackingState } : null,
      })),
      drafts: activeDrafts.filter((d) => d.visibility === 'public').map((d) => ({ id: d.id, code: d.code, name: d.name, status: d.state.status, teamNames: d.teamNames, simulated: d.simulated, startedAt: d.state.startedAt, format: d.state.config.format, picks: d.state.picks, players: [d.state.captains.amber, d.state.captains.sapphire].filter(Boolean).length + d.state.members.amber.length + d.state.members.sapphire.length })),
      recent: recent.map((r) => ({ matchId: r.matchId, winner: r.winner, source: r.source, verified: r.verified, durationSec: r.match.durationSec, date: r.createdAt, pugNumber: r.match.pug?.number ?? null, isSimulated: r.match.isSimulated, teams: Object.fromEntries((r.match.pug?.teams ?? []).map((t) => [t.side.toLowerCase(), t.name])) })),
      leaderboard: top.map((t) => ({ userId: t.userId, displayName: t.user.displayName, rating: t.rating, wins: t.wins, losses: t.losses })),
      season: season && { id: season.id, name: season.name, isSimulated: season.isSimulated },
    };
  });

  // ---------- PUGs ----------
  const createPugBody = z.object({
    format: z.enum(['6v6', '4v4', '2v2']).default('6v6'), draftProvider: z.enum(['NATIVE', 'DEADLOCKLABS', 'EXTERNAL']).default('NATIVE'),
    amberName: z.string().min(1).max(32).default('Team Amber'), sapphireName: z.string().min(1).max(32).default('Team Sapphire'),
    externalUrl: z.string().url().optional(),
  });
  async function createPug(userId: string, body: z.infer<typeof createPugBody>, simulated = false) {
    const pug = await db.pugSession.create({ data: { format: body.format, draftProvider: body.draftProvider, createdById: userId, isSimulated: simulated, teams: { create: [{ side: 'AMBER', name: body.amberName }, { side: 'SAPPHIRE', name: body.sapphireName }] } } });
    if (body.externalUrl && body.draftProvider !== 'NATIVE') {
      const p = providers[body.draftProvider === 'DEADLOCKLABS' ? 'deadlocklabs' : 'external'];
      if (!p.validateUrl!(body.externalUrl)) throw Object.assign(new Error(`URL is not a valid ${p.displayName} link`), { statusCode: 400 });
      await db.externalDraftLink.create({ data: { pugId: pug.id, provider: body.draftProvider, url: body.externalUrl } });
    }
    await audit(db, userId, 'pug.create', 'PugSession', pug.id, null, body);
    await notifier.enqueue('pug.created', `pug.created:${pug.id}`, { title: `PUG #${pug.number} created`, description: `${body.format} · ${body.amberName} vs ${body.sapphireName}`, color: COLORS.teal, url: `${cfg.PUBLIC_URL}/` }, simulated);
    hub.publish('dashboard', 'pug.created', { id: pug.id });
    return pug;
  }
  app.post('/api/pugs', { preHandler: requireRole('MODERATOR') }, async (req) => createPug(req.user!.id, createPugBody.parse(req.body), req.user!.isSimulated));
  app.get('/api/pugs/:id', async (req) => {
    const { id } = req.params as { id: string };
    const p = await db.pugSession.findUnique({ where: { id }, include: { teams: true, participants: { include: { user: true } }, draftRooms: true, externalDrafts: true, matches: true } });
    if (!p) throw Object.assign(new Error('PUG not found'), { statusCode: 404 });
    return {
      ...p, participants: p.participants.map((x) => ({ ...x, user: publicUser(x.user) })), matches: p.matches.map(publicMatch),
      draftRooms: p.draftRooms.map((d) => ({ id: d.id, code: d.code, name: d.name, status: d.status, createdAt: d.createdAt })),
    };
  });
  app.post('/api/pugs/:id/participants', { preHandler: requireRole('MODERATOR') }, async (req) => {
    const { id } = req.params as { id: string };
    const b = z.object({ userId: z.string(), team: z.enum(['AMBER', 'SAPPHIRE']).nullable(), isCaptain: z.boolean().default(false) }).parse(req.body);
    const row = await db.pugParticipant.upsert({ where: { pugId_userId: { pugId: id, userId: b.userId } }, create: { pugId: id, ...b }, update: b });
    await audit(db, req.user!.id, 'pug.participant', 'PugSession', id, null, b);
    return row;
  });
  app.post('/api/pugs/:id/cancel', { preHandler: requireRole('MODERATOR') }, async (req) => {
    const { id } = req.params as { id: string };
    const before = await db.pugSession.findUniqueOrThrow({ where: { id } });
    const p = await db.pugSession.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit(db, req.user!.id, 'pug.cancel', 'PugSession', id, { status: before.status }, { status: 'CANCELLED' });
    hub.publish('dashboard', 'pug.updated', { id }); return p;
  });

  // External draft: link + manual import (no automated sync — see docs/API_FEASIBILITY.md §4)
  app.post('/api/pugs/:id/external-draft/import', { preHandler: requireRole('MODERATOR') }, async (req) => {
    const { id } = req.params as { id: string };
    const team = z.array(z.number().int());
    const b = z.object({ linkId: z.string(), picks: z.object({ amber: team, sapphire: team }), bans: z.object({ amber: team, sapphire: team }), bansPerTeam: z.number().int().min(0).max(6).default(2) }).parse(req.body);
    const pug = await db.pugSession.findUniqueOrThrow({ where: { id } });
    const errs = validateImport(b, TEAM_SIZE[pug.format as '6v6'], b.bansPerTeam, heroes.map((h) => h.id));
    if (errs.length) throw Object.assign(new Error(errs.join('; ')), { statusCode: 400 });
    const link = await db.externalDraftLink.update({ where: { id: b.linkId, pugId: id }, data: { importedResult: { picks: b.picks, bans: b.bans, manual: true }, importedById: req.user!.id, importedAt: new Date() } });
    await audit(db, req.user!.id, 'draft.import', 'ExternalDraftLink', link.id, null, b);
    return link;
  });

  // ---------- Drafts ----------
  const createDraftBody = z.object({
    name: z.string().min(1).max(64), pugId: z.string().optional(),
    amberName: z.string().min(1).max(32).default('Team Amber'), sapphireName: z.string().min(1).max(32).default('Team Sapphire'),
    format: z.enum(['6v6', '4v4', '2v2']).default('6v6'), bansPerTeam: z.number().int().min(0).max(6).default(2),
    timerSeconds: z.union([z.literal(0), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).default(30),
    timeoutBehavior: z.enum(['random', 'skip', 'pause']).default('skip'), allowMirrorPicks: z.boolean().default(false),
    firstTeam: z.enum(['amber', 'sapphire']).default('amber'), banPhases: z.union([z.literal(1), z.literal(2)]).optional(),
    sequence: z.array(z.object({ team: z.enum(['amber', 'sapphire']), type: z.enum(['pick', 'ban']) })).max(40).optional(),
    amberCaptainId: z.string().nullable().default(null), sapphireCaptainId: z.string().nullable().default(null),
    visibility: z.enum(['public', 'private']).default('public'),
  });
  app.post('/api/drafts', { preHandler: requireRole('PLAYER'), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = createDraftBody.parse(req.body);
    // Pre-assigning captains is a moderator tool; everyone else creates an open lobby and claims seats.
    if (!isMod(req.user)) { b.amberCaptainId = null; b.sapphireCaptainId = null; }
    for (const cid of [b.amberCaptainId, b.sapphireCaptainId]) if (cid && !(await db.user.findUnique({ where: { id: cid } }))) throw Object.assign(new Error('Captain not found'), { statusCode: 400 });
    let rec;
    try {
      rec = await drafts.create({ ...b, teamNames: { amber: b.amberName, sapphire: b.sapphireName }, captains: { amber: b.amberCaptainId, sapphire: b.sapphireCaptainId }, simulated: req.user!.isSimulated });
    } catch (e) { throw Object.assign(e as Error, { statusCode: 400 }); }
    for (const [t, uid] of [['AMBER', b.amberCaptainId], ['SAPPHIRE', b.sapphireCaptainId]] as const) {
      if (uid) { const u = await db.user.findUniqueOrThrow({ where: { id: uid } }); await db.draftParticipant.create({ data: { draftId: rec.id, userId: uid, team: t, isCaptain: true, displayNameSnapshot: u.displayName } }); }
    }
    await audit(db, req.user!.id, 'draft.create', 'DraftRoom', rec.id, null, b);
    return rec;
  });
  app.get('/api/drafts', async (req) => (await store.listRecent(30)).filter((d) => d.visibility === 'public' || isMod(req.user)).map((d) => ({ id: d.id, code: d.code, name: d.name, status: d.state.status, teamNames: d.teamNames, simulated: d.simulated })));
  app.get('/api/drafts/code/:code', async (req) => {
    const code = z.string().regex(/^[A-Za-z0-9]{6}$/).parse((req.params as { code: string }).code).toUpperCase();
    const rec = await store.getByCode(code);
    if (!rec) throw Object.assign(new Error('No draft room with that code'), { statusCode: 404 });
    return { id: rec.id, code: rec.code };
  });
  /** Display names for everyone referenced by the draft (captains, players, assignment targets). */
  async function draftPeople(rec: NonNullable<Awaited<ReturnType<typeof drafts.get>>>) {
    const ids = new Set<string>([...Object.values(rec.state.captains), ...rec.state.members.amber, ...rec.state.members.sapphire].filter((x): x is string => !!x));
    const parts = await db.draftParticipant.findMany({ where: { draftId: rec.id } });
    const users = await db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, displayName: true } });
    const people: Record<string, string> = {};
    for (const p of parts) people[p.userId] = p.displayNameSnapshot;
    for (const u of users) people[u.id] = u.displayName;
    return { people, participants: parts };
  }
  /** Keeps DraftParticipant rows (with name snapshots) in line with seats and team membership. */
  async function syncParticipants(rec: NonNullable<Awaited<ReturnType<typeof drafts.get>>>) {
    const s = rec.state;
    const want = new Map<string, { team: 'AMBER' | 'SAPPHIRE'; isCaptain: boolean }>();
    for (const t of ['amber', 'sapphire'] as const) {
      if (s.captains[t]) want.set(s.captains[t]!, { team: toSide(t), isCaptain: true });
      for (const m of s.members[t]) want.set(m, { team: toSide(t), isCaptain: false });
    }
    const users = await db.user.findMany({ where: { id: { in: [...want.keys()] } } });
    await db.$transaction([
      db.draftParticipant.deleteMany({ where: { draftId: rec.id, userId: { notIn: [...want.keys()] } } }),
      ...users.map((u) => db.draftParticipant.upsert({ where: { draftId_userId: { draftId: rec.id, userId: u.id } }, create: { draftId: rec.id, userId: u.id, displayNameSnapshot: u.displayName, ...want.get(u.id)! }, update: want.get(u.id)! })),
    ]);
  }
  app.get('/api/drafts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const rec = await drafts.get(id);
    if (!rec) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });
    return { ...DraftService.publicView(rec), ...(await draftPeople(rec)), serverNow: Date.now(), presence: presence(id), you: req.user ? { id: req.user.id, isModerator: isMod(req.user), displayName: req.user.displayName } : null };
  });
  const commandBody = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('start') }), z.object({ kind: z.literal('pause') }), z.object({ kind: z.literal('resume') }), z.object({ kind: z.literal('cancel') }),
    z.object({ kind: z.literal('select'), heroId: z.number().int(), expectedSeq: z.number().int().min(0) }),
    z.object({ kind: z.literal('correct'), historySeq: z.number().int(), heroId: z.number().int() }),
    z.object({ kind: z.literal('skip'), expectedSeq: z.number().int().min(0) }),
    z.object({ kind: z.literal('hover'), heroId: z.number().int().nullable() }),
    z.object({ kind: z.literal('claimSeat'), team: z.enum(['amber', 'sapphire']) }),
    z.object({ kind: z.literal('leaveSeat') }), z.object({ kind: z.literal('swapSides') }), z.object({ kind: z.literal('voteRematch') }),
    z.object({ kind: z.literal('setReady'), ready: z.boolean() }),
    z.object({ kind: z.literal('joinTeam'), team: z.enum(['amber', 'sapphire']).nullable() }),
    z.object({ kind: z.literal('setTimeoutBehavior'), behavior: z.enum(['random', 'skip', 'pause']) }),
    z.object({ kind: z.literal('assign'), heroId: z.number().int(), userId: z.string().nullable() }),
  ]);
  const ROSTER_COMMANDS = new Set(['claimSeat', 'leaveSeat', 'swapSides', 'joinTeam']);
  const AUDITED_COMMANDS = new Set(['start', 'pause', 'resume', 'cancel', 'correct']);
  app.post('/api/drafts/:id/command', { preHandler: requireRole('SPECTATOR'), config: { rateLimit: { max: 60, timeWindow: '10 seconds' } } }, async (req) => {
    const { id } = req.params as { id: string };
    const cmd = commandBody.parse(req.body) as DraftCommand;
    const rec = await drafts.execute(id, cmd, { userId: req.user!.id, isModerator: isMod(req.user) });
    if (ROSTER_COMMANDS.has(cmd.kind) || rec.id !== id) await syncParticipants(rec);
    if (ROSTER_COMMANDS.has(cmd.kind)) hub.publish(`draft:${rec.id}`, 'draft.people', (await draftPeople(rec)).people);
    if (AUDITED_COMMANDS.has(cmd.kind)) await audit(db, req.user!.id, `draft.${cmd.kind}`, 'DraftRoom', id, null, cmd);
    return DraftService.publicView(rec);
  });

  // ---------- Deadlock custom lobby (via deadlock-api bot) ----------
  /** The party code lets anyone into the game, so only captains, team players and moderators see it. */
  const lobbyFor = (lobby: Awaited<ReturnType<typeof lobbies.forDraft>>, canJoin: boolean) => (lobby && !canJoin ? { ...lobby, partyCode: null, partyId: null } : lobby);
  const inDraft = (rec: NonNullable<Awaited<ReturnType<typeof drafts.get>>>, u: User | null) =>
    !!u && (isMod(u) || Object.values(rec.state.captains).includes(u.id) || rec.state.members.amber.includes(u.id) || rec.state.members.sapphire.includes(u.id));
  app.get('/api/drafts/:id/lobby', async (req) => {
    const { id } = req.params as { id: string };
    const rec = await drafts.get(id);
    if (!rec) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });
    return { lobby: lobbyFor(await lobbies.forDraft(id), inDraft(rec, req.user)) };
  });
  app.post('/api/drafts/:id/lobby', { preHandler: requireRole('PLAYER'), config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = req.params as { id: string };
    const rec = await drafts.get(id);
    if (!rec) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });
    const isCaptain = Object.values(rec.state.captains).includes(req.user!.id);
    if (!isCaptain && !isMod(req.user)) throw Object.assign(new Error('Only a captain or moderator can create the lobby'), { statusCode: 403 });
    if (rec.state.status !== 'completed') throw Object.assign(new Error('Finish the draft first'), { statusCode: 409 });
    // Serialize per draft so two captains clicking at once create one lobby.
    const lock = redis ? new RedisLock(redis, 60_000, 50_000) : new MemoryLock();
    const lobby = await lock.withLock(`lobby:${id}`, () => lobbies.create({ draftId: id, pugId: rec.pugId, createdById: req.user!.id, teamSize: TEAM_SIZE[rec.state.config.format], allowDuplicateHeroes: rec.state.config.allowMirrorPicks }));
    await audit(db, req.user!.id, 'lobby.create', 'Match', lobby.matchRowId, null, { draftId: id, partyId: lobby.partyId });
    hub.publish(`draft:${id}`, 'draft.lobby', lobbyFor(lobby, false)); // participants refetch to get the code
    return { lobby };
  });
  // deadlock-api POSTs here when the match starts, and to /settings when lobby settings change.
  app.post('/api/webhooks/deadlock-lobby/:id', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await db.match.findUnique({ where: { id } });
    if (!row || !verifyCallbackSecret(req.headers['x-callback-secret'], row.callbackSecretHash)) return reply.code(401).send({ error: 'Invalid callback' });
    const matchId = parseCallbackMatchId(req.body);
    if (!matchId) { app.log.warn({ body: req.body }, 'deadlock-api callback without a recognisable match id'); return reply.code(400).send({ error: 'No match id' }); }
    await lobbies.attach(row.id, matchId, 'webhook');
    return { ok: true };
  });
  app.post('/api/webhooks/deadlock-lobby/:id/settings', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const row = await db.match.findUnique({ where: { id: (req.params as { id: string }).id } });
    if (!row || !verifyCallbackSecret(req.headers['x-callback-secret'], row.callbackSecretHash)) return reply.code(401).send({ error: 'Invalid callback' });
    return { ok: true }; // lobby settings changes are not used yet
  });

  // ---------- Tracker / Matches ----------
  app.post('/api/tracker/resolve', { preHandler: requireRole('MODERATOR'), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const b = z.object({ identifier: z.string().min(1).max(40), type: z.enum(['auto', 'lobby', 'party', 'match']).default('auto'), pugId: z.string().optional(), draftId: z.string().optional() }).parse(req.body);
    const out = await resolveIdentifier(api, b.identifier, b.type);
    let match = null;
    if (out.matchId || out.partyId) {
      const data = { partyId: out.partyId, pugId: b.pugId ?? null, draftId: b.draftId ?? null, trackingState: out.state.toUpperCase() as 'MATCH_DETECTED', trackingNote: out.explanation };
      match = out.matchId
        ? await db.match.upsert({ where: { deadlockMatchId: out.matchId }, create: { deadlockMatchId: out.matchId, ...data }, update: { ...data, pugId: b.pugId ?? undefined, draftId: b.draftId ?? undefined } })
        : await db.match.create({ data });
      if (out.matchId && out.state === 'match_detected') { await onMatchStarted(match.id); match = await db.match.findUniqueOrThrow({ where: { id: match.id } }); }
      await audit(db, req.user!.id, 'match.track', 'Match', match.id, null, b);
      hub.publish('dashboard', 'match.updated', { id: match.id });
    }
    return { resolution: out, match: match && publicMatch(match) };
  });
  app.get('/api/matches', async () => (await db.match.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { result: true, pug: true } })).map(publicMatch));
  app.get('/api/matches/:id', async (req) => {
    const { id } = req.params as { id: string };
    const m = await db.match.findUnique({ where: { id }, include: { result: { include: { stats: true } }, pug: { include: { teams: true } }, participants: true } });
    if (!m) throw Object.assign(new Error('Match not found'), { statusCode: 404 });
    const draft = m.draftId ? await drafts.get(m.draftId) : null;
    return { ...publicMatch(m), draft: draft && DraftService.publicView(draft) };
  });
  app.get('/api/matches/:id/live', async (req) => {
    const { id } = req.params as { id: string };
    return live.get(id, isMod(req.user)) ?? { state: null, stale: true, publicDelaySec: cfg.PUBLIC_LIVE_DELAY_SEC };
  });
  app.post('/api/matches/:id/result', { preHandler: requireRole('MODERATOR') }, async (req) => {
    const { id } = req.params as { id: string };
    const b = z.object({ winner: z.enum(['amber', 'sapphire']), amber: z.array(z.string()).min(1).max(6), sapphire: z.array(z.string()).min(1).max(6) }).parse(req.body);
    const m = await db.match.findUniqueOrThrow({ where: { id } });
    const season = await db.season.findFirst({ where: { isActive: true } });
    if (!season) throw Object.assign(new Error('No active season'), { statusCode: 409 });
    const source = m.isSimulated ? 'SIMULATED' : 'MANUAL';
    const repo = new PrismaResultsRepo(db, () => toSide(b.winner));
    const outcome = await processResult(repo, { matchId: id, seasonId: season.id, source, verifiedBy: req.user!.id, winners: b.winner === 'amber' ? b.amber : b.sapphire, losers: b.winner === 'amber' ? b.sapphire : b.amber }, { allowSimulated: season.isSimulated, initialRating: season.initialRating, elo: { k: season.kFactor, provisionalK: 40, provisionalGames: 10, scale: 400 } });
    if (outcome.status !== 'duplicate') {
      const result = await db.matchResult.findUniqueOrThrow({ where: { matchId: id } });
      const users = await db.user.findMany({ where: { id: { in: [...b.amber, ...b.sapphire] } } });
      const ls = live.get(id, true)?.state;
      // Hero per player: live data if we have it, otherwise the captain's assignment from the linked draft.
      const draftRec = m.draftId ? await drafts.get(m.draftId) : null;
      const assigned = new Map((draftRec?.state.assignments ?? []).map((a) => [a.userId, a.heroId]));
      await db.playerStatistic.createMany({ data: users.map((u) => {
        const team = b.amber.includes(u.id) ? 'amber' : 'sapphire';
        const lp = ls ? Object.values(ls.players).find((p) => p.name === u.displayName) : undefined;
        return { resultId: result.id, userId: u.id, team: toSide(team), won: team === b.winner, displayNameSnapshot: u.displayName, heroId: lp?.heroId ?? assigned.get(u.id) ?? null, kills: lp?.kills ?? null, deaths: lp?.deaths ?? null, assists: lp?.assists ?? null, netWorth: lp?.netWorth ?? null, heroDamage: lp?.heroDamage ?? null };
      }), skipDuplicates: true });
      await db.match.update({ where: { id }, data: { trackingState: 'MATCH_COMPLETED' } });
      if (m.pugId) await db.pugSession.update({ where: { id: m.pugId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await audit(db, req.user!.id, 'match.result.manual', 'Match', id, null, { ...b, outcome });
      await notifier.enqueue('match.result', `match.result:${id}`, { title: `Result: Team ${b.winner === 'amber' ? 'Amber' : 'Sapphire'} wins`, description: `${source === 'MANUAL' ? 'Manually verified by a moderator' : 'Simulated'}`, url: `${cfg.PUBLIC_URL}/matches/${id}`, color: COLORS.teal }, m.isSimulated);
      hub.publish('dashboard', 'match.completed', { id });
    }
    return outcome;
  });

  // ---------- Leaderboard / Players ----------
  app.get('/api/leaderboard', async (req) => {
    const q = z.object({ seasonId: z.string().optional(), minMatches: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    const season = q.seasonId ? await db.season.findUnique({ where: { id: q.seasonId } }) : await db.season.findFirst({ where: { isActive: true } });
    if (!season) return { season: null, rows: [] };
    const rows = await db.playerRating.findMany({ where: { seasonId: season.id, gamesPlayed: { gte: q.minMatches }, user: { visibility: { not: 'PRIVATE' } } }, orderBy: { rating: 'desc' }, take: 200, include: { user: true } });
    const stats = await db.playerStatistic.groupBy({ by: ['userId'], where: { userId: { in: rows.map((r) => r.userId) }, result: { seasonId: season.id } }, _avg: { kills: true, deaths: true, assists: true } });
    const heroCounts = await db.playerStatistic.groupBy({ by: ['userId', 'heroId'], where: { userId: { in: rows.map((r) => r.userId) }, heroId: { not: null }, result: { seasonId: season.id } }, _count: true });
    const sMap = new Map(stats.map((s) => [s.userId, s._avg]));
    const fav = new Map<string, { heroId: number; n: number }>();
    for (const h of heroCounts) { const c = fav.get(h.userId!); if (!c || h._count > c.n) fav.set(h.userId!, { heroId: h.heroId!, n: h._count }); }
    return { season: { id: season.id, name: season.name, isSimulated: season.isSimulated }, rows: rows.map((r, i) => ({
      rank: i + 1, userId: r.userId, displayName: r.user.displayName, rating: r.rating, wins: r.wins, losses: r.losses, matches: r.gamesPlayed,
      winRate: r.gamesPlayed ? r.wins / r.gamesPlayed : null, avg: sMap.get(r.userId) ?? null, mostPlayedHero: fav.get(r.userId) ? heroName(fav.get(r.userId)!.heroId) : null,
    })) };
  });
  app.get('/api/seasons', async () => db.season.findMany({ orderBy: { startsAt: 'desc' } }));
  app.get('/api/players/:id', async (req) => {
    const { id } = req.params as { id: string };
    const u = await db.user.findUnique({ where: { id }, include: { discord: true, steam: true, ratings: { include: { season: true } } } });
    if (!u) throw Object.assign(new Error('Player not found'), { statusCode: 404 });
    const self = req.user?.id === id;
    if (u.visibility === 'PRIVATE' && !self && !isMod(req.user)) throw Object.assign(new Error('This profile is private'), { statusCode: 403 });
    if (u.visibility === 'MEMBERS' && !req.user) throw Object.assign(new Error('Log in to view this profile'), { statusCode: 401 });
    const [history, ratingHistory] = await Promise.all([
      db.playerStatistic.findMany({ where: { userId: id }, include: { result: true }, orderBy: { result: { createdAt: 'desc' } }, take: 30 }),
      db.ratingTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' }, take: 200 }),
    ]);
    return { user: publicUser(u), visibility: u.visibility, discord: u.discord && { username: u.discord.username }, steam: u.steam && { accountId: u.steam.accountId }, ratings: u.ratings, history: history.map((h) => ({ ...h, heroName: h.heroId ? heroName(h.heroId) : null })), ratingHistory };
  });
  app.patch('/api/me/visibility', { preHandler: requireRole('SPECTATOR') }, async (req) => {
    const b = z.object({ visibility: z.enum(['PUBLIC', 'MEMBERS', 'PRIVATE']) }).parse(req.body);
    return publicUser(await db.user.update({ where: { id: req.user!.id }, data: b }));
  });
  app.get('/api/users', { preHandler: requireRole('CAPTAIN') }, async () => (await db.user.findMany({ orderBy: { displayName: 'asc' }, take: 500 })).map(publicUser));

  // ---------- Admin ----------
  app.get('/api/admin/audit', { preHandler: requireRole('ADMIN') }, async () => db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }));
  app.get('/api/admin/notifications', { preHandler: requireRole('ADMIN') }, async () => db.discordNotification.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
  app.patch('/api/admin/users/:id/role', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = req.params as { id: string };
    const b = z.object({ role: z.enum(ROLES) }).parse(req.body);
    const target = await db.user.findUniqueOrThrow({ where: { id } });
    if (!canAssignRole(req.user!.role as Role, b.role) || !canAssignRole(req.user!.role as Role, target.role as Role)) throw Object.assign(new Error('Cannot assign this role'), { statusCode: 403 });
    const u = await db.user.update({ where: { id }, data: { role: b.role } });
    await audit(db, req.user!.id, 'user.role', 'User', id, { role: target.role }, { role: b.role });
    return publicUser(u);
  });
  app.post('/api/admin/seasons', { preHandler: requireRole('ADMIN') }, async (req) => {
    const b = z.object({ name: z.string().min(1).max(64), initialRating: z.number().int().min(100).max(5000).default(1500), kFactor: z.number().int().min(1).max(100).default(24), activate: z.boolean().default(true) }).parse(req.body);
    const s = await db.$transaction(async (tx) => {
      if (b.activate) await tx.season.updateMany({ where: { isActive: true }, data: { isActive: false, endsAt: new Date() } });
      return tx.season.create({ data: { name: b.name, initialRating: b.initialRating, kFactor: b.kFactor, isActive: b.activate, startsAt: b.activate ? new Date() : null, isSimulated: req.user!.isSimulated } });
    });
    await audit(db, req.user!.id, 'season.create', 'Season', s.id, null, b);
    return s;
  });
  app.post('/api/admin/seasons/:id/end', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = req.params as { id: string };
    const s = await db.season.update({ where: { id }, data: { isActive: false, isArchived: true, endsAt: new Date() } });
    await audit(db, req.user!.id, 'season.end', 'Season', id); return s;
  });
  app.put('/api/admin/discord', { preHandler: requireRole('ADMIN') }, async (req) => {
    const b = z.object({ discordGuildId: z.string().regex(/^\d+$/), name: z.string().default('Guild'), announceChannelId: z.string().regex(/^\d+$/).nullable(), resultsChannelId: z.string().regex(/^\d+$/).nullable().default(null), draftChannelId: z.string().regex(/^\d+$/).nullable().default(null) }).parse(req.body);
    const g = await db.guild.upsert({ where: { discordGuildId: b.discordGuildId }, create: b, update: b });
    await audit(db, req.user!.id, 'discord.config', 'Guild', g.id, null, b); return g;
  });
  app.get('/api/admin/health', { preHandler: requireRole('ADMIN') }, async () => ({
    heroes: { count: heroes.length, source: heroSource }, discordBot: !!opts.discordSender, liveEvents: cfg.LIVE_EVENTS_URL ?? null, deadlockApi: cfg.DEADLOCK_API_URL, apiKeyConfigured: !!cfg.DEADLOCK_API_KEY,
    failedNotifications: await db.discordNotification.count({ where: { status: 'failed' } }), simulationMode: cfg.SIMULATION_MODE,
  }));
  app.post('/api/admin/heroes/refresh', { preHandler: requireRole('ADMIN') }, async () => { await loadHeroes(); return { count: heroes.length, source: heroSource }; });

  // ---------- Simulation ----------
  if (cfg.SIMULATION_MODE) {
    app.post('/api/sim/workflow', { preHandler: requireRole('MODERATOR') }, async (req) => {
      const b = z.object({ format: z.enum(['6v6', '4v4', '2v2']).default('6v6'), speedMs: z.number().int().min(50).max(5000).default(800), draftStepMs: z.number().int().min(50).max(20000).default(4500) }).parse(req.body ?? {});
      const size = TEAM_SIZE[b.format];
      const players = await Promise.all(Array.from({ length: size * 2 }, async (_, i) => {
        const name = `[SIM] Player ${i + 1}`;
        return (await db.user.findFirst({ where: { displayName: name, isSimulated: true } })) ?? db.user.create({ data: { displayName: name, isSimulated: true, role: i % size === 0 ? 'CAPTAIN' : 'PLAYER' } });
      }));
      let season = await db.season.findFirst({ where: { isActive: true } });
      if (!season) season = await db.season.create({ data: { name: '[SIM] Simulation Season', isActive: true, isSimulated: true, startsAt: new Date() } });
      const pug = await createPug(req.user!.id, { format: b.format, draftProvider: 'NATIVE', amberName: 'Team Amber', sapphireName: 'Team Sapphire' }, true);
      const amber = players.slice(0, size), sapphire = players.slice(size);
      await db.pugParticipant.createMany({ data: players.map((p, i) => ({ pugId: pug.id, userId: p.id, team: i < size ? 'AMBER' : 'SAPPHIRE', isCaptain: i % size === 0 })) });
      const rec = await drafts.create({ name: `[SIM] PUG #${pug.number} draft`, pugId: pug.id, format: b.format, timerSeconds: 30, captains: { amber: amber[0]!.id, sapphire: sapphire[0]!.id }, simulated: true });
      await db.draftParticipant.createMany({ data: players.map((p, i) => ({ draftId: rec.id, userId: p.id, team: i < size ? 'AMBER' : 'SAPPHIRE', isCaptain: i % size === 0, displayNameSnapshot: p.displayName })) });
      const actor = { userId: req.user!.id, isModerator: true };
      void (async () => {
        // Draft at a watchable pace: a lead-in so spectators can open the room, then a jittered "thinking" time per turn.
        const wait = (ms = b.draftStepMs * (0.65 + Math.random() * 0.7)) => new Promise((r) => setTimeout(r, ms));
        await wait(Math.max(b.draftStepMs, 6000));
        let s = (await drafts.execute(rec.id, { kind: 'start' }, actor)).state;
        while (s.status === 'drafting') {
          await wait();
          const step = s.config.sequence[s.step]!;
          const taken = new Set([...s.picks.amber, ...s.picks.sapphire, ...s.bans.amber, ...s.bans.sapphire]);
          const pool = heroes.filter((h) => !taken.has(h.id));
          const hero = pool[Math.floor(Math.random() * pool.length)]!;
          s = (await drafts.execute(rec.id, { kind: 'select', heroId: hero.id, expectedSeq: s.seq }, { userId: s.captains[step.team]!, isModerator: false })).state;
        }
        const match = await db.match.create({ data: { pugId: pug.id, draftId: rec.id, isSimulated: true, trackingState: 'LIVE_AVAILABLE', trackingNote: 'SIMULATED match — generated locally, no Deadlock API involved.', startedAt: new Date() } });
        await db.pugSession.update({ where: { id: pug.id }, data: { status: 'LIVE' } });
        hub.publish('dashboard', 'match.updated', { id: match.id });
        hub.publish(`draft:${rec.id}`, 'draft.match', { matchId: match.id });
        const roster = [...s.picks.amber.map((h, i) => ({ name: amber[i]!.displayName, heroId: h, team: 'amber' as const })), ...s.picks.sapphire.map((h, i) => ({ name: sapphire[i]!.displayName, heroId: h, team: 'sapphire' as const }))];
        const winner = await simulateMatch(live, match.id, roster, { tickMs: b.speedMs, durationTicks: 90 });
        const repo = new PrismaResultsRepo(db, () => toSide(winner));
        await processResult(repo, { matchId: match.id, seasonId: season!.id, source: 'SIMULATED', verifiedBy: null, winners: (winner === 'amber' ? amber : sapphire).map((u) => u.id), losers: (winner === 'amber' ? sapphire : amber).map((u) => u.id) }, { allowSimulated: season!.isSimulated });
        const result = await db.matchResult.findUniqueOrThrow({ where: { matchId: match.id } });
        const ls = live.get(match.id, true)!.state!;
        await db.playerStatistic.createMany({ data: Object.values(ls.players).map((p) => {
          const u = players.find((x) => x.displayName === p.name)!; const team = p.team === 2 ? 'amber' : 'sapphire';
          return { resultId: result.id, userId: u.id, team: toSide(team), heroId: p.heroId, kills: p.kills, deaths: p.deaths, assists: p.assists, netWorth: p.netWorth, heroDamage: p.heroDamage, won: team === winner, displayNameSnapshot: u.displayName };
        }) });
        await db.match.update({ where: { id: match.id }, data: { trackingState: 'MATCH_COMPLETED', durationSec: Math.round(ls.gameTime ?? 0), endedAt: new Date() } });
        await db.pugSession.update({ where: { id: pug.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
        await notifier.enqueue('match.result', `match.result:${match.id}`, { title: `Result: Team ${winner === 'amber' ? 'Amber' : 'Sapphire'} wins`, url: `${cfg.PUBLIC_URL}/matches/${match.id}`, color: COLORS.teal }, true);
        hub.publish('dashboard', 'match.completed', { id: match.id });
      })().catch((e) => app.log.error(e, 'simulation failed'));
      return { pugId: pug.id, draftId: rec.id };
    });
  }

  // ---------- WebSocket ----------
  /** Who is watching each draft (user ids of logged-in viewers; anonymous viewers are only counted). */
  const draftViewers = new Map<string, Map<string, string | null>>();
  function presence(draftId: string) {
    const v = draftViewers.get(draftId);
    return { watchers: v?.size ?? 0, online: [...new Set([...(v?.values() ?? [])].filter((x): x is string => !!x))] };
  }
  const announcePresence = (draftId: string) => hub.publish(`draft:${draftId}`, 'draft.presence', presence(draftId));
  app.get('/ws', { websocket: true }, (socket, req) => {
    const sub = { id: randomUUID(), send: (d: string) => socket.send(d) };
    const watching = new Set<string>();
    socket.on('message', async (raw: Buffer) => {
      let msg: { op?: string; topic?: string };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (typeof msg.topic !== 'string' || msg.topic.length > 100) return;
      const [kind, id, scope] = msg.topic.split(':');
      if (msg.op === 'unsub') {
        hub.unsubscribe(msg.topic, sub);
        if (kind === 'draft' && id && watching.delete(id)) { draftViewers.get(id)?.delete(sub.id); announcePresence(id); }
        return;
      }
      if (msg.op !== 'sub') return;
      if (kind === 'dashboard') hub.subscribe('dashboard', sub);
      else if (kind === 'draft' && id) {
        const rec = await drafts.get(id);
        if (!rec || (rec.visibility === 'private' && !req.user)) return socket.send(JSON.stringify({ type: 'error', topic: msg.topic, payload: 'Not allowed' }));
        hub.subscribe(msg.topic, sub);
        socket.send(JSON.stringify({ type: 'draft.state', topic: msg.topic, payload: DraftService.publicView(rec), serverNow: Date.now() })); // fresh snapshot on (re)subscribe
        const viewers = draftViewers.get(id) ?? draftViewers.set(id, new Map()).get(id)!;
        viewers.set(sub.id, req.user?.id ?? null); watching.add(id); announcePresence(id);
      } else if (kind === 'match' && id) {
        if (scope === 'mod' && !isMod(req.user)) return socket.send(JSON.stringify({ type: 'error', topic: msg.topic, payload: 'Moderators only' }));
        hub.subscribe(msg.topic, sub);
        const snap = live.get(id, scope === 'mod');
        if (snap) socket.send(JSON.stringify({ type: 'live.state', topic: msg.topic, payload: snap, serverNow: Date.now() }));
      }
    });
    socket.on('close', () => {
      hub.unsubscribeAll(sub);
      for (const d of watching) { draftViewers.get(d)?.delete(sub.id); if (!draftViewers.get(d)?.size) draftViewers.delete(d); announcePresence(d); }
    });
  });

  // ---------- Website (production) ----------
  // Serving the SPA from the same process means an image update always ships matching web files (no shared volume).
  if (cfg.WEB_DIST_DIR) {
    const root = resolve(cfg.WEB_DIST_DIR);
    if (!existsSync(resolve(root, 'index.html'))) throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);
    await app.register(fastifyStatic, {
      root, wildcard: false, index: false, cacheControl: false, // our setHeaders decides caching
      // Hashed assets are immutable; index.html must always be revalidated so new deploys show up immediately.
      setHeaders: (res, path) => res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/ws')) return reply.code(404).send({ error: 'Not found' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html', { cacheControl: false });
    });
  }

  app.addHook('onClose', async () => { drafts.shutdown(); lobbies.stop(); await db.$disconnect(); redis?.disconnect(); });
  return { app, db, hub, drafts, createPug, leaderboardTop: async (n: number) => {
    const s = await db.season.findFirst({ where: { isActive: true } });
    if (!s) return [];
    return (await db.playerRating.findMany({ where: { seasonId: s.id }, orderBy: { rating: 'desc' }, take: n, include: { user: true } })).map((r) => ({ displayName: r.user.displayName, rating: r.rating, wins: r.wins, losses: r.losses }));
  } };
}
