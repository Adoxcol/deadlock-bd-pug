import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { importMatch, previewMatchImport } from '../src/results/importMatch.js';
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
});
