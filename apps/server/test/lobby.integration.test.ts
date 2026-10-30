import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { LobbyService, BOT_LIFETIME_MS } from '../src/lobby/service.js';
import type { DeadlockApi } from '../src/tracker/deadlockApi.js';

// Runs only with TEST_DATABASE_URL (a disposable, migrated Postgres). The normal suite needs no database.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('LobbyService (Postgres)', () => {
  let db: PrismaClient;
  const draftId = `test-draft-${Date.now()}`;
  let partyMatch: string | null = null;
  let created = 0;
  const started: string[] = [];
  let now = Date.now();
  const api: DeadlockApi = {
    matchMetadata: async () => ({ ok: false, status: 'not_found', message: '' }),
    partyMatchId: async () => (partyMatch ? { ok: true, data: { matchId: partyMatch } } : { ok: false, status: 'not_found', message: '' }),
    createCustomLobby: async () => { created++; return { ok: true, data: { partyId: `9${Date.now()}${created}`, partyCode: `CODE${created}`, callbackSecret: 'sec' } }; },
  };
  const log = { warn: () => {}, error: (e: unknown) => { throw e; } };
  let svc: LobbyService;
  beforeAll(() => {
    db = new PrismaClient({ datasources: { db: { url } } });
    svc = new LobbyService(db, api, { publicUrl: 'https://pugs.example.com', region: 'singapore', log }, async (id) => { started.push(id); }, () => now);
  });
  afterAll(async () => { await db.match.deleteMany({ where: { draftId } }); await db.$disconnect(); });

  it('creates one lobby per draft while the bot is in it', async () => {
    const a = await svc.create({ draftId, pugId: null, createdById: 'u', teamSize: 2, allowDuplicateHeroes: false });
    const b = await svc.create({ draftId, pugId: null, createdById: 'u', teamSize: 2, allowDuplicateHeroes: false });
    expect(a.matchRowId).toBe(b.matchRowId); expect(created).toBe(1);
    expect(a.partyCode).toBe('CODE1'); expect(a.state).toBe('LOBBY_FOUND'); expect(a.webhook).toBe(true);
  });
  it('marks the lobby as waiting once the bot has left, and allows a new one', async () => {
    now += BOT_LIFETIME_MS + 1000;
    await svc.pollOnce();
    expect((await svc.forDraft(draftId))!.state).toBe('WAITING_FOR_MATCH');
    const c = await svc.create({ draftId, pugId: null, createdById: 'u', teamSize: 2, allowDuplicateHeroes: false });
    expect(c.partyCode).toBe('CODE2');
  });
  it('polling attaches the Match ID once, and webhook repeats are no-ops', async () => {
    partyMatch = `${Date.now()}`.slice(-9);
    await svc.pollOnce();
    const l = await svc.forDraft(draftId);
    expect(l!.deadlockMatchId).toBe(partyMatch); expect(l!.state).toBe('MATCH_DETECTED');
    const n = started.length;
    expect(await svc.attach(l!.matchRowId, partyMatch, 'webhook')).toBe(l!.matchRowId);
    expect(started.length).toBe(n);
    await expect(svc.attach(l!.matchRowId, '123', 'webhook')).rejects.toThrow(/different match/);
  });
  it('links a match a moderator already tracked by hand, and refuses one owned by another draft', async () => {
    const d2 = `${draftId}-b`, mid = `5${Date.now()}`.slice(0, 10);
    const manual = await db.match.create({ data: { deadlockMatchId: mid, trackingState: 'MATCH_DETECTED' } });
    const l = await svc.create({ draftId: d2, pugId: null, createdById: 'u', teamSize: 2, allowDuplicateHeroes: false });
    expect(await svc.attach(l.matchRowId, mid, 'webhook')).toBe(manual.id);
    expect((await svc.forDraft(d2))!.deadlockMatchId).toBe(mid);
    const d3 = `${draftId}-c`;
    const other = await svc.create({ draftId: d3, pugId: null, createdById: 'u', teamSize: 2, allowDuplicateHeroes: false });
    await expect(svc.attach(other.matchRowId, mid, 'webhook')).rejects.toThrow(/different draft/);
    expect((await svc.forDraft(d3))!.state).toBe('MANUAL_REQUIRED');
    await db.match.deleteMany({ where: { draftId: { in: [d2, d3] } } });
  });
});
