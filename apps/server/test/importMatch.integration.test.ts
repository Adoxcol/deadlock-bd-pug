import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { importKnownMatch, importMatch, previewMatchImport, recordLobbyResult } from '../src/results/importMatch.js';
import type { DeadlockApi } from '../src/tracker/deadlockApi.js';

// Runs only with TEST_DATABASE_URL (a disposable, migrated Postgres). The normal suite needs no database.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('importMatch (Postgres)', () => {
  let db: PrismaClient;
  let actor: string;
  const base = Date.now() % 1_000_000 * 1000;
  const a = String(base + 1), b = String(base + 2);
  const raw = (start: number) => ({ match_info: { start_time: start, duration_s: 1800, winning_team: 0, players: [
    { account_id: Number(a), team: 0, hero_id: 86, kills: 10, deaths: 2, assists: 5, net_worth: 40000, stats: [] },
    { account_id: Number(b), team: 1, hero_id: 1, kills: 2, deaths: 10, assists: 1, net_worth: 20000, stats: [] },
  ] } });
  const starts: Record<string, number> = {};
  const api = { matchMetadata: async (id: string) => (starts[id] ? { ok: true, data: raw(starts[id]!) } : { ok: false, status: 'not_found', message: '' }) } as unknown as DeadlockApi;
  const names = { [a]: 'Alpha', [b]: 'Bravo' };
  const later = `${base}1`, earlier = `${base}2`;
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.season.updateMany({ where: { isActive: true }, data: { isActive: false } });
    await db.season.create({ data: { name: `import ${base}`, isActive: true } });
    actor = (await db.user.create({ data: { displayName: 'Moderator' } })).id;
    starts[later] = 2_000_000; starts[earlier] = 1_000_000;
  });
  afterAll(async () => { await db.$disconnect(); });

  it('previews without writing', async () => {
    const p = await previewMatchImport(db, api, later);
    expect(p.winner).toBe('AMBER');
    expect(p.players.map((x) => [x.team, x.name])).toEqual([['AMBER', null], ['SAPPHIRE', null]]);
    expect(await db.match.findUnique({ where: { deadlockMatchId: later } })).toBeNull();
  });
  it('requires every name and an available match', async () => {
    await expect(importMatch(db, api, { matchId: later, names: { [a]: 'Alpha' }, verifiedById: actor })).rejects.toMatchObject({ statusCode: 400 });
    await expect(importMatch(db, api, { matchId: '1', names, verifiedById: actor })).rejects.toMatchObject({ statusCode: 404 });
  });
  it('stores a rated result with placeholders, and refuses a second import', async () => {
    await importMatch(db, api, { matchId: later, names, verifiedById: actor });
    const m = await db.match.findUniqueOrThrow({ where: { deadlockMatchId: later }, include: { result: { include: { stats: true } } } });
    expect(m.result).toMatchObject({ winner: 'AMBER', rated: true, verified: true, verifiedById: actor, amberRating: 1200, sapphireRating: 1200 });
    expect(m.result!.stats.find((s) => s.team === 'AMBER')).toMatchObject({ won: true, heroId: 86, displayNameSnapshot: 'Alpha' });
    await expect(importMatch(db, api, { matchId: later, names, verifiedById: actor })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('reuses accounts and recalculates later matches when an older one arrives', async () => {
    expect((await previewMatchImport(db, api, earlier)).players[0]!.name).toBe('Alpha');
    const owner = (await db.steamAccount.findUniqueOrThrow({ where: { accountId: a } })).userId;
    await importMatch(db, api, { matchId: earlier, names, verifiedById: actor });
    expect(await db.playerStatistic.count({ where: { userId: owner } })).toBe(2);
    const r = await db.match.findUniqueOrThrow({ where: { deadlockMatchId: later }, include: { result: true } });
    expect(r.result!.amberRating).toBeGreaterThan(r.result!.sapphireRating!);
  });
  it('adds a match by anyone only when every player is known', async () => {
    const known = `${base}3`; starts[known] = 3_000_000;
    expect(await importKnownMatch(db, api, { matchId: known, verifiedById: actor })).toMatchObject({ status: 'imported' });
    const strangers = `${base}4`;
    const other = { matchMetadata: async () => ({ ok: true, data: { match_info: { start_time: 4_000_000, winning_team: 1, players: [{ account_id: base + 9, team: 0, hero_id: 2 }] } } }) } as unknown as DeadlockApi;
    expect(await importKnownMatch(db, other, { matchId: strangers, verifiedById: actor })).toEqual({ status: 'unknown_players', unknown: 1 });
    expect(await db.match.findUnique({ where: { deadlockMatchId: strangers } })).toBeNull();
  });
  it('records a lobby result on its own, once, naming assigned players', async () => {
    const id = `${base}5`;
    const row = await db.match.create({ data: { deadlockMatchId: id, partyId: `p${base}`, trackingState: 'MATCH_DETECTED' } });
    const lobbyApi = { matchMetadata: async () => ({ ok: true, data: { match_info: { start_time: 5_000_000, duration_s: 60, winning_team: 1, players: [{ account_id: base + 7, team: 0, hero_id: 3 }, { account_id: Number(b), team: 1, hero_id: 1 }] } } }) } as unknown as DeadlockApi;
    const drafted = await db.user.create({ data: { displayName: 'Drafted' } });
    expect(await recordLobbyResult(db, lobbyApi, row.id, [{ userId: drafted.id, heroId: 3 }])).toBe(true);
    expect(await recordLobbyResult(db, lobbyApi, row.id, [])).toBe(false);
    const done = await db.match.findUniqueOrThrow({ where: { id: row.id }, include: { result: { include: { stats: true } } } });
    expect(done.trackingState).toBe('MATCH_COMPLETED');
    expect(done.result).toMatchObject({ source: 'API', rated: true, winner: 'SAPPHIRE' });
    expect(done.result!.stats.find((s) => s.team === 'AMBER')).toMatchObject({ userId: drafted.id, displayNameSnapshot: 'Drafted', won: false });
  });
  it('leaves a running match alone', async () => {
    const row = await db.match.create({ data: { deadlockMatchId: `${base}6`, partyId: `q${base}` } });
    const running = { matchMetadata: async () => ({ ok: true, data: { match_info: { players: [{ account_id: 1, team: 0, hero_id: 1 }] } } }) } as unknown as DeadlockApi;
    await expect(recordLobbyResult(db, running, row.id, [])).rejects.toMatchObject({ statusCode: 422 });
    expect(await db.matchResult.findUnique({ where: { matchId: row.id } })).toBeNull();
  });
});
