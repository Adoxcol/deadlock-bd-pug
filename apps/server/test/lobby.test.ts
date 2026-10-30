import { describe, expect, it } from 'vitest';
import { applyCommand, buildDefaultSequence, createDraftState, turnRun, upgradeState } from '../src/draft/engine.js';
import type { DraftCommand, DraftConfig, DraftState } from '../src/draft/types.js';
import { DraftService } from '../src/draft/service.js';
import { MemoryDraftStore } from '../src/draft/store.js';
import { MemoryLock } from '../src/draft/lock.js';
import { Hub } from '../src/realtime/hub.js';

const heroIds = Array.from({ length: 30 }, (_, i) => i + 1);
const u = (userId: string, isModerator = false) => ({ userId, isModerator });
const ctx = (now = 1000) => ({ now, heroIds, random: () => 0 });
const cfg = (o: Partial<DraftConfig> = {}): DraftConfig => ({ format: '2v2', bansPerTeam: 1, timerSeconds: 30, timeoutBehavior: 'skip', allowMirrorPicks: false, sequence: buildDefaultSequence(o.format ?? '2v2', o.bansPerTeam ?? 1), ...o });
const run = (s: DraftState, ...steps: Array<[DraftCommand, ReturnType<typeof u> | null]>) => steps.reduce((st, [c, a]) => applyCommand(st, c, a, ctx()), s);
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as { code: string }).code; } return 'OK'; };
const open = () => createDraftState(cfg(), { amber: null, sapphire: null });
const seated = () => run(open(), [{ kind: 'claimSeat', team: 'amber' }, u('a')], [{ kind: 'claimSeat', team: 'sapphire' }, u('b')]);

describe('sequence building', () => {
  it('matches the observed 2v2 / 1 ban order: A ban, B ban, A, B, B, A', () => {
    expect(buildDefaultSequence('2v2', 1).map((s) => `${s.team[0]}${s.type[0]}`).join(' ')).toBe('ab sb ap sp sp ap');
  });
  it('splits 6v6 bans into two phases and keeps the snake across the split', () => {
    const seq = buildDefaultSequence('6v6', 2, 'amber', 2).map((s) => `${s.team[0]}${s.type[0]}`);
    expect(seq.join(' ')).toBe('ab sb ap sp sp ap ap sp ab sb sp ap ap sp sp ap');
    expect(seq.filter((x) => x === 'ap')).toHaveLength(6);
  });
  it('reports consecutive turns', () => {
    let s = run(seated(), [{ kind: 'setReady', ready: true }, u('a')], [{ kind: 'setReady', ready: true }, u('b')]);
    s = run(s, [{ kind: 'skip', expectedSeq: s.seq }, u('a')]);
    s = run(s, [{ kind: 'skip', expectedSeq: s.seq }, u('b')]);
    s = run(s, [{ kind: 'select', heroId: 1, expectedSeq: s.seq }, u('a')]);
    expect(turnRun(s)).toEqual({ index: 1, length: 2 });
    s = run(s, [{ kind: 'select', heroId: 2, expectedSeq: s.seq }, u('b')]);
    expect(turnRun(s)).toEqual({ index: 2, length: 2 });
  });
});

describe('lobby', () => {
  it('seats: claim, cannot steal, switch, leave', () => {
    let s = run(open(), [{ kind: 'claimSeat', team: 'amber' }, u('a')]);
    expect(code(() => applyCommand(s, { kind: 'claimSeat', team: 'amber' }, u('b'), ctx()))).toBe('SEAT_TAKEN');
    expect(code(() => applyCommand(s, { kind: 'claimSeat', team: 'amber' }, null, ctx()))).toBe('LOGIN_REQUIRED');
    s = run(s, [{ kind: 'claimSeat', team: 'sapphire' }, u('a')]);
    expect(s.captains).toEqual({ amber: null, sapphire: 'a' });
    s = run(s, [{ kind: 'leaveSeat' }, u('a')]);
    expect(s.captains.sapphire).toBeNull();
  });
  it('auto-starts when both captains are ready; un-ready blocks', () => {
    let s = run(seated(), [{ kind: 'setReady', ready: true }, u('a')]);
    expect(s.status).toBe('waiting');
    expect(code(() => applyCommand(s, { kind: 'setReady', ready: true }, u('spectator'), ctx()))).toBe('NOT_CAPTAIN');
    s = run(s, [{ kind: 'setReady', ready: true }, u('b')]);
    expect(s.status).toBe('drafting'); expect(s.turnEndsAt).toBe(31_000);
  });
  it('swap sides moves captains and resets readiness', () => {
    const s = run(seated(), [{ kind: 'setReady', ready: true }, u('a')], [{ kind: 'swapSides' }, u('b')]);
    expect(s.captains).toEqual({ amber: 'b', sapphire: 'a' }); expect(s.ready.amber).toBe(false);
  });
  it('players join teams, team size is capped, captains cannot double-join', () => {
    let s = run(seated(), [{ kind: 'joinTeam', team: 'amber' }, u('p1')]);
    expect(s.members.amber).toEqual(['p1']);
    expect(code(() => applyCommand(s, { kind: 'joinTeam', team: 'amber' }, u('p2'), ctx()))).toBe('SEAT_TAKEN'); // 2v2: captain + 1
    expect(code(() => applyCommand(s, { kind: 'joinTeam', team: 'sapphire' }, u('a'), ctx()))).toBe('NOT_IN_LOBBY');
    s = run(s, [{ kind: 'joinTeam', team: null }, u('p1')]);
    expect(s.members.amber).toEqual([]);
  });
  it('only captains change the ban timeout setting', () => {
    expect(code(() => applyCommand(seated(), { kind: 'setTimeoutBehavior', behavior: 'random' }, u('x'), ctx()))).toBe('NOT_CAPTAIN');
    expect(run(seated(), [{ kind: 'setTimeoutBehavior', behavior: 'random' }, u('a')]).config.timeoutBehavior).toBe('random');
  });
});

describe('drafting', () => {
  const live = () => run(seated(), [{ kind: 'setReady', ready: true }, u('a')], [{ kind: 'setReady', ready: true }, u('b')]);
  it('skip only works on your own ban turn', () => {
    const s = live();
    expect(code(() => applyCommand(s, { kind: 'skip', expectedSeq: s.seq }, u('b'), ctx()))).toBe('NOT_YOUR_TURN');
    const k = applyCommand(s, { kind: 'skip', expectedSeq: s.seq }, u('a'), ctx());
    expect(k.bans.amber).toEqual([]); expect(k.history[0]!.heroId).toBeNull();
    const p = run(k, [{ kind: 'skip', expectedSeq: k.seq }, u('b')]);
    expect(code(() => applyCommand(p, { kind: 'skip', expectedSeq: p.seq }, u('a'), ctx()))).toBe('NOT_A_BAN');
  });
  it('hover does not bump seq and is used by random timeout', () => {
    const s = run(live(), [{ kind: 'hover', heroId: 7 }, u('a')]);
    expect(s.seq).toBe(live().seq);
    expect(code(() => applyCommand(s, { kind: 'hover', heroId: 8 }, u('b'), ctx()))).toBe('NOT_YOUR_TURN');
    const r = { ...s, config: { ...s.config, timeoutBehavior: 'random' as const } };
    expect(applyCommand(r, { kind: 'timeout', expectedSeq: s.seq }, null, ctx(40_000)).bans.amber).toEqual([7]);
    expect(applyCommand(s, { kind: 'timeout', expectedSeq: s.seq }, null, ctx(40_000)).bans.amber).toEqual([]); // 'skip' = no ban
  });
});

describe('after the draft', () => {
  function done() {
    let s = run(seated(), [{ kind: 'joinTeam', team: 'amber' }, u('p1')], [{ kind: 'joinTeam', team: 'sapphire' }, u('p2')],
      [{ kind: 'setReady', ready: true }, u('a')], [{ kind: 'setReady', ready: true }, u('b')]);
    let h = 1;
    while (s.status === 'drafting') { const t = s.config.sequence[s.step]!.team; s = applyCommand(s, { kind: 'select', heroId: h++, expectedSeq: s.seq }, u(t === 'amber' ? 'a' : 'b'), ctx()); }
    return s;
  }
  it('captain assigns picked heroes to their own players, one hero each', () => {
    let s = done();
    const [h1, h2] = s.picks.amber as [number, number];
    expect(code(() => applyCommand(s, { kind: 'assign', heroId: h1, userId: 'p1' }, u('b'), ctx()))).toBe('NOT_CAPTAIN');
    expect(code(() => applyCommand(s, { kind: 'assign', heroId: h1, userId: 'p2' }, u('a'), ctx()))).toBe('INVALID_ASSIGNMENT');
    s = run(s, [{ kind: 'assign', heroId: h1, userId: 'p1' }, u('a')], [{ kind: 'assign', heroId: h2, userId: 'p1' }, u('a')]);
    expect(s.assignments).toEqual([{ team: 'amber', heroId: h2, userId: 'p1' }]);
    s = run(s, [{ kind: 'assign', heroId: h1, userId: 'a' }, u('a')]);
    expect(s.assignments).toHaveLength(2);
  });
  it('rematch needs both captains and opens a new room with the same code', async () => {
    const hub = new Hub(); const store = new MemoryDraftStore();
    const svc = new DraftService(store, new MemoryLock(), hub, () => heroIds);
    const d = await svc.create({ name: 'r', format: '2v2', bansPerTeam: 1 });
    const ex = (c: DraftCommand, a: string) => svc.execute(d.id, c, u(a));
    await ex({ kind: 'claimSeat', team: 'amber' }, 'a'); await ex({ kind: 'claimSeat', team: 'sapphire' }, 'b');
    await ex({ kind: 'setReady', ready: true }, 'a'); let r = await ex({ kind: 'setReady', ready: true }, 'b');
    let h = 1;
    while (r.state.status === 'drafting') { const t = r.state.config.sequence[r.state.step]!.team; r = await ex({ kind: 'select', heroId: h++, expectedSeq: r.state.seq }, t === 'amber' ? 'a' : 'b'); }
    expect((await ex({ kind: 'voteRematch' }, 'a')).id).toBe(d.id);
    const next = await ex({ kind: 'voteRematch' }, 'b');
    expect(next.id).not.toBe(d.id); expect(next.code).toBe(d.code);
    expect(next.state.status).toBe('waiting'); expect(next.state.captains).toEqual({ amber: 'a', sapphire: 'b' }); expect(next.state.ready.amber).toBe(false);
    expect((await store.getByCode(d.code!))!.id).toBe(next.id);
    expect((await store.get(d.id))!.state.status).toBe('completed'); // history preserved
    svc.shutdown();
  });
  it('upgrades old stored snapshots', () => {
    const { members, ready, hover, rematchVotes, assignments, ...old } = createDraftState(cfg(), { amber: null, sapphire: null });
    expect(upgradeState(old as DraftState).members).toEqual({ amber: [], sapphire: [] });
  });
});
