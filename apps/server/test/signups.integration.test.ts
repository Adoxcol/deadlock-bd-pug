import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Notifier } from '../src/discord/notifier.js';
import { SignupService } from '../src/discord/signups.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('PUG sign-ups', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  afterAll(() => db.$disconnect());
  const notifier = new Notifier(db, null, async () => null);
  let formed = 0;
  const svc = new SignupService(db, notifier, 'https://x', async (_h, _f, ids) => { formed++; return { id: `pug-${formed}`, number: formed, captains: [ids[0]!, ids[1]!] }; }, async () => {}, () => {});
  const tag = () => `${Date.now()}${Math.random()}`;
  const queued = (key: string) => db.discordNotification.count({ where: { dedupeKey: key } });

  it('fills once under simultaneous clicks, posts one-left once, and DMs both captains', async () => {
    const t = tag();
    const s = await svc.start({ channelId: 'c', hostId: `u0${t}`, hostDiscordId: `d0${t}`, format: '2v2', scheduledAt: null, captainMode: 'rated' });
    await svc.join(s.id, `u1${t}`, `d1${t}`);
    const before = formed;
    await svc.join(s.id, `u2${t}`, `d2${t}`);
    expect(await queued(`signup.one-left:${s.id}`)).toBe(1);
    const results = await Promise.allSettled(['3', '4', '5'].map((n) => svc.join(s.id, `u${n}${t}`, `d${n}${t}`)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(formed).toBe(before + 1);
    const done = await db.pugSignup.findUniqueOrThrow({ where: { id: s.id }, include: { players: true } });
    expect(done.players).toHaveLength(4);
    expect(done.status).toBe('FILLED');
    expect(await queued(`signup.captain:${s.id}:u0${t}`)).toBe(1);
    expect(await queued(`signup.captain:${s.id}:u1${t}`)).toBe(1);
  });

  it('holds a scheduled roster until its start, then a tick forms it', async () => {
    const t = tag();
    const start = new Date(Date.now() + 3600_000);
    const s = await svc.start({ channelId: 'c', hostId: `u0${t}`, hostDiscordId: `d0${t}`, format: '2v2', scheduledAt: start, captainMode: 'random' });
    for (const n of [1, 2, 3]) await svc.join(s.id, `u${n}${t}`, `d${n}${t}`);
    expect((await db.pugSignup.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('OPEN');
    await svc.tick(new Date(start.getTime() - 60_000));
    expect(await queued(`signup.reminder:${s.id}`)).toBe(1);
    await svc.tick(new Date(start.getTime() + 60_000));
    expect((await db.pugSignup.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('FILLED');
  });

  it('lets only the host or a moderator close it', async () => {
    const t = tag();
    const s = await svc.start({ channelId: 'c', hostId: `h${t}`, hostDiscordId: `d${t}`, format: '2v2', scheduledAt: null, captainMode: 'rated' });
    await expect(svc.cancel(s.id, { id: 'other', isMod: false })).rejects.toThrow('Only the host');
    expect((await svc.cancel(s.id, { id: 'other', isMod: true })).status).toBe('CANCELLED');
  });
});
