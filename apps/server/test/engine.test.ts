import { describe, expect, it } from 'vitest';
import { applyCommand, buildDefaultSequence, createDraftState, DraftError } from '../src/draft/engine.js';
import type { DraftConfig, DraftState } from '../src/draft/types.js';

const heroIds = Array.from({ length: 30 }, (_, i) => i + 1);
const mod = { userId: 'mod', isModerator: true };
const capA = { userId: 'a', isModerator: false };
const capS = { userId: 's', isModerator: false };
const cfg = (o: Partial<DraftConfig> = {}): DraftConfig => ({ format: '6v6', bansPerTeam: 2, timerSeconds: 30, timeoutBehavior: 'random', allowMirrorPicks: false, sequence: buildDefaultSequence(o.format ?? '6v6', o.bansPerTeam ?? 2), ...o });
const ctx = (now = 1000) => ({ now, heroIds, random: () => 0 });
const started = (c = cfg()) => applyCommand(createDraftState(c, { amber: 'a', sapphire: 's' }), { kind: 'start' }, mod, ctx());
const cap = (s: DraftState) => (s.config.sequence[s.step]!.team === 'amber' ? capA : capS);
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as DraftError).code; } return 'OK'; };

describe('draft engine', () => {
  it('builds sequences with correct counts for all formats', () => {
    for (const f of ['6v6', '4v4', '2v2'] as const) {
      const seq = buildDefaultSequence(f, 1);
      const n = { '6v6': 6, '4v4': 4, '2v2': 2 }[f];
      expect(seq.filter((s) => s.type === 'pick' && s.team === 'amber')).toHaveLength(n);
      expect(seq.filter((s) => s.type === 'pick' && s.team === 'sapphire')).toHaveLength(n);
    }
    expect(buildDefaultSequence('2v2', 0).map((s) => s.team[0]).join('')).toBe('assa');
  });
  it('rejects invalid config', () => {
    expect(() => createDraftState(cfg({ sequence: [] }), { amber: 'a', sapphire: 's' })).toThrow();
  });
  it('only moderators start; captains required', () => {
    const s = createDraftState(cfg(), { amber: 'a', sapphire: null });
    expect(code(() => applyCommand(s, { kind: 'start' }, capA, ctx()))).toBe('FORBIDDEN');
    expect(code(() => applyCommand(s, { kind: 'start' }, mod, ctx()))).toBe('NO_CAPTAINS');
  });
  it('runs a full draft in turn order to completion', () => {
    let s = started();
    let h = 1;
    while (s.status === 'drafting') s = applyCommand(s, { kind: 'select', heroId: h++, expectedSeq: s.seq }, cap(s), ctx());
    expect(s.status).toBe('completed');
    expect(s.picks.amber).toHaveLength(6); expect(s.bans.sapphire).toHaveLength(2);
    expect(s.history).toHaveLength(16);
  });
  it('enforces turn, permissions and spectators', () => {
    const s = started();
    expect(code(() => applyCommand(s, { kind: 'select', heroId: 1, expectedSeq: s.seq }, capS, ctx()))).toBe('NOT_YOUR_TURN');
    expect(code(() => applyCommand(s, { kind: 'select', heroId: 1, expectedSeq: s.seq }, { userId: 'spec', isModerator: false }, ctx()))).toBe('NOT_YOUR_TURN');
    expect(code(() => applyCommand(s, { kind: 'select', heroId: 1, expectedSeq: s.seq }, null, ctx()))).toBe('NOT_YOUR_TURN');
  });
  it('rejects banned, duplicate and unknown heroes', () => {
    let s = started();
    s = applyCommand(s, { kind: 'select', heroId: 5, expectedSeq: s.seq }, capA, ctx()); // amber bans 5
    expect(code(() => applyCommand(s, { kind: 'select', heroId: 5, expectedSeq: s.seq }, capS, ctx()))).toBe('HERO_UNAVAILABLE');
    expect(code(() => applyCommand(s, { kind: 'select', heroId: 999, expectedSeq: s.seq }, capS, ctx()))).toBe('HERO_UNKNOWN');
    s = applyCommand(s, { kind: 'select', heroId: 6, expectedSeq: s.seq }, capS, ctx());
    s = applyCommand(s, { kind: 'select', heroId: 7, expectedSeq: s.seq }, capA, ctx());
    s = applyCommand(s, { kind: 'select', heroId: 8, expectedSeq: s.seq }, capS, ctx());
    s = applyCommand(s, { kind: 'select', heroId: 10, expectedSeq: s.seq }, capA, ctx()); // amber picks 10
    expect(code(() => applyCommand(s, { kind: 'select', heroId: 10, expectedSeq: s.seq }, capS, ctx()))).toBe('HERO_UNAVAILABLE');
  });
  it('allows mirror picks when configured', () => {
    let s = started(cfg({ bansPerTeam: 0, sequence: buildDefaultSequence('6v6', 0), allowMirrorPicks: true }));
    s = applyCommand(s, { kind: 'select', heroId: 10, expectedSeq: s.seq }, capA, ctx());
    s = applyCommand(s, { kind: 'select', heroId: 10, expectedSeq: s.seq }, capS, ctx());
    expect(code(() => applyCommand(s, { kind: 'select', heroId: 10, expectedSeq: s.seq }, capS, ctx()))).toBe('HERO_UNAVAILABLE');
  });
  it('rejects a second action in the same turn via stale seq', () => {
    const s = started();
    const after = applyCommand(s, { kind: 'select', heroId: 1, expectedSeq: s.seq }, capA, ctx());
    expect(code(() => applyCommand(after, { kind: 'select', heroId: 2, expectedSeq: s.seq }, capS, ctx()))).toBe('STALE_SEQ');
  });
  it('timeout: not before expiry; random fills; skip skips bans only; pause pauses', () => {
    const s = started();
    expect(code(() => applyCommand(s, { kind: 'timeout', expectedSeq: s.seq }, null, ctx(2000)))).toBe('TIMER_NOT_EXPIRED');
    const r = applyCommand(s, { kind: 'timeout', expectedSeq: s.seq }, null, ctx(31_000));
    expect(r.bans.amber).toEqual([1]); expect(r.history[0]!.reason).toBe('timeout');
    expect(r.turnEndsAt).toBe(61_000);
    const sk = applyCommand(started(cfg({ timeoutBehavior: 'skip' })), { kind: 'timeout', expectedSeq: 1 }, null, ctx(31_000));
    expect(sk.bans.amber).toEqual([]); expect(sk.step).toBe(1);
    const p = applyCommand(started(cfg({ timeoutBehavior: 'pause' })), { kind: 'timeout', expectedSeq: 1 }, null, ctx(31_000));
    expect(p.status).toBe('paused');
    const res = applyCommand(p, { kind: 'resume' }, mod, ctx(40_000));
    expect(res.turnEndsAt).toBe(70_000);
  });
  it('pause preserves remaining time across resume', () => {
    const s = started();
    const p = applyCommand(s, { kind: 'pause' }, mod, ctx(11_000));
    expect(p.pausedRemainingMs).toBe(20_000);
    expect(code(() => applyCommand(p, { kind: 'select', heroId: 1, expectedSeq: p.seq }, capA, ctx()))).toBe('NOT_ACTIVE');
    expect(code(() => applyCommand(p, { kind: 'resume' }, capA, ctx()))).toBe('FORBIDDEN');
    expect(applyCommand(p, { kind: 'resume' }, mod, ctx(100_000)).turnEndsAt).toBe(120_000);
  });
  it('disabled timer has no deadline', () => {
    expect(started(cfg({ timerSeconds: 0 })).turnEndsAt).toBeNull();
  });
  it('moderator correction swaps a hero and is audited in history', () => {
    let s = started();
    s = applyCommand(s, { kind: 'select', heroId: 1, expectedSeq: s.seq }, capA, ctx());
    s = applyCommand(s, { kind: 'correct', historySeq: 2, heroId: 3 }, mod, ctx());
    expect(s.bans.amber).toEqual([3]);
    expect(s.history.at(-1)!.reason).toBe('correction');
    expect(code(() => applyCommand(s, { kind: 'correct', historySeq: 2, heroId: 4 }, capA, ctx()))).toBe('FORBIDDEN');
  });
  it('does not mutate input state', () => {
    const s = started(); const snap = JSON.stringify(s);
    applyCommand(s, { kind: 'select', heroId: 1, expectedSeq: s.seq }, capA, ctx());
    expect(JSON.stringify(s)).toBe(snap);
  });
});
