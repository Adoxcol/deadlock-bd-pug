import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { linkSteam } from '../src/auth/linkSteam.js';

// Runs only with TEST_DATABASE_URL (a disposable, migrated Postgres). The normal suite needs no database.
const url = process.env.TEST_DATABASE_URL;
const OFFSET = 76561197960265728n;
describe.skipIf(!url)('linkSteam (Postgres)', () => {
  let db: PrismaClient;
  const run = Date.now() % 1_000_000;
  let next = 0;
  const steam = () => { const accountId = String(run * 1000 + ++next); return { accountId, steamId64: String(OFFSET + BigInt(accountId)) }; };
  const user = (displayName: string) => db.user.create({ data: { displayName } });
  const placeholder = (s: ReturnType<typeof steam>) => db.user.create({ data: { displayName: 'Imported', steam: { create: s } } });
  const result = async () => {
    const season = await db.season.create({ data: { name: `linkSteam ${run} ${++next}` } });
    const match = await db.match.create({ data: {} });
    return db.matchResult.create({ data: { matchId: match.id, seasonId: season.id, winner: 'AMBER', source: 'API' } });
  };
  const stat = (resultId: string, userId: string) => db.playerStatistic.create({ data: { resultId, userId, team: 'AMBER', won: true, displayNameSnapshot: 'Imported' } });
  beforeAll(() => { db = new PrismaClient({ datasources: { db: { url } } }); });
  afterAll(async () => { await db.$disconnect(); });

  it('moves a placeholder\'s matches to the real player and removes the placeholder', async () => {
    const s = steam(); const me = await user('Real'); const old = await placeholder(s);
    await stat((await result()).id, old.id); await stat((await result()).id, old.id);
    expect(await linkSteam(db, me.id, s.steamId64)).toEqual({ status: 'linked', claimed: 2 });
    expect(await db.playerStatistic.count({ where: { userId: me.id } })).toBe(2);
    expect(await db.user.findUnique({ where: { id: old.id } })).toBeNull();
    expect((await db.steamAccount.findUnique({ where: { userId: me.id } }))?.accountId).toBe(s.accountId);
  });
  it('links a Steam ID nobody has, and repeating a link changes nothing', async () => {
    const s = steam(); const me = await user('Fresh');
    expect(await linkSteam(db, me.id, s.steamId64)).toEqual({ status: 'linked', claimed: 0 });
    expect(await linkSteam(db, me.id, s.steamId64)).toEqual({ status: 'linked', claimed: 0 });
  });
  it('refuses a Steam ID that belongs to a real Discord account', async () => {
    const s = steam(); const me = await user('Thief'); const owner = await placeholder(s);
    await db.discordAccount.create({ data: { userId: owner.id, discordId: s.accountId, username: 'owner' } });
    expect(await linkSteam(db, me.id, s.steamId64)).toEqual({ status: 'taken' });
    expect((await db.steamAccount.findUnique({ where: { steamId64: s.steamId64 } }))?.userId).toBe(owner.id);
  });
  it('refuses and keeps everything when both accounts played the same match', async () => {
    const s = steam(); const me = await user('Both'); const old = await placeholder(s); const r = await result();
    await stat(r.id, me.id); await stat(r.id, old.id);
    expect(await linkSteam(db, me.id, s.steamId64)).toEqual({ status: 'taken' });
    expect(await db.playerStatistic.count({ where: { resultId: r.id } })).toBe(2);
    expect(await db.user.findUnique({ where: { id: old.id } })).not.toBeNull();
  });
});
