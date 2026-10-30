import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftService } from '../src/draft/service.js';
import { MemoryDraftStore } from '../src/draft/store.js';
import { MemoryLock } from '../src/draft/lock.js';
import { Hub } from '../src/realtime/hub.js';

const heroIds = Array.from({ length: 30 }, (_, i) => i + 1);
const mod = { userId: 'mod', isModerator: true };
const capA = { userId: 'a', isModerator: false };

function setup() {
  const hub = new Hub(); const store = new MemoryDraftStore(); const events: string[] = [];
  const svc = new DraftService(store, new MemoryLock(), hub, () => heroIds, (e) => events.push(e));
  const msgs: Array<{ type: string; payload: any; serverNow: number }> = [];
  return { hub, store, svc, events, msgs, spectator: { id: 'x', send: (d: string) => msgs.push(JSON.parse(d)) } };
}

describe('DraftService', () => {
  afterEach(() => vi.useRealTimers());
  it('serializes concurrent actions: exactly one wins per turn', async () => {
    const { svc } = setup();
    const d = await svc.create({ name: 't', captains: { amber: 'a', sapphire: 's' } });
    await svc.execute(d.id, { kind: 'start' }, mod);
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((h) => svc.execute(d.id, { kind: 'select', heroId: h, expectedSeq: 1 }, capA)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await svc.get(d.id);
    expect(after!.state.bans.amber).toHaveLength(1);
    svc.shutdown();
  });
  it('broadcasts state with server timestamp to subscribers (sync & reconnect via fresh snapshot)', async () => {
    const { svc, hub, msgs, spectator, events } = setup();
    const d = await svc.create({ name: 't', captains: { amber: 'a', sapphire: 's' } });
    hub.subscribe(`draft:${d.id}`, spectator);
    await svc.execute(d.id, { kind: 'start' }, mod);
    expect(msgs.at(-1)!.type).toBe('draft.state');
    expect(msgs.at(-1)!.payload.state.status).toBe('drafting');
    expect(typeof msgs.at(-1)!.serverNow).toBe('number');
    expect(events).toEqual(['draft.started']);
    hub.unsubscribeAll(spectator); // disconnect
    await svc.execute(d.id, { kind: 'select', heroId: 1, expectedSeq: 1 }, capA);
    const snapshot = await svc.get(d.id); // reconnect fetches authoritative snapshot
    expect(snapshot!.state.seq).toBe(2);
    svc.shutdown();
  });
  it('fires server-side timeout and advances', async () => {
    vi.useFakeTimers({ now: 0 });
    const { svc } = setup();
    const d = await svc.create({ name: 't', timerSeconds: 30, captains: { amber: 'a', sapphire: 's' } });
    await svc.execute(d.id, { kind: 'start' }, mod);
    await vi.advanceTimersByTimeAsync(30_100);
    const s = (await svc.get(d.id))!.state;
    expect(s.step).toBe(1); expect(s.history[0]!.reason).toBe('timeout');
    svc.shutdown();
  });
});
