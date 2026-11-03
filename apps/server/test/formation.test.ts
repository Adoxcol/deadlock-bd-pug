import { describe, expect, it } from 'vitest';
import { defaultTeamName, applyFormationCommand, newFormation, pickingCaptain, type Formation, type FormationCommand , applyInvite } from '../src/draft/formation.js';
import { applyCommand, buildDefaultSequence, createDraftState } from '../src/draft/engine.js';

function room(size = 6) {
  let state = newFormation();
  const run = (cmd: FormationCommand, id: string, seq = state.seq) => state = applyFormationCommand(state, cmd, id, size, seq, () => 'b');
  for (let i = 0; i < size * 2; i++) run({ kind: 'join' }, `p${i}`);
  run({ kind: 'captain', seat: 'a' }, 'p0'); run({ kind: 'captain', seat: 'b' }, 'p1');
  return { run, get state() { return state; } };
}
describe('PUG team formation', () => {
  for (const size of [2, 4, 6]) for (const advantage of ['first', 'side'] as const) it(`${size}v${size}: toss winner chooses ${advantage}, then teams fill without duplicates`, () => {
    const r = room(size);
    r.run({ kind: 'toss' }, 'p0');
    expect(r.state.winner).toBe('b');
    expect(() => r.run({ kind: 'toss' }, 'p0')).toThrow();
    expect(() => r.run({ kind: 'choice', advantage }, 'p0')).toThrow();
    r.run({ kind: 'choice', advantage }, 'p1');
    expect(r.state.first).toBe(advantage === 'first' ? 'b' : 'a');
    r.run({ kind: 'side', side: 'amber' }, r.state.captains[r.state.sideChooser!]!);
    expect(r.state.sides[r.state.first!]).toBe('sapphire');
    expect(() => r.run({ kind: 'leave' }, 'p2')).toThrow();
    expect(() => r.run({ kind: 'join' }, 'late')).toThrow();
    for (let i = 2; i < size * 2; i++) {
      const picker = pickingCaptain(r.state)!;
      const other = picker === 'a' ? 'b' : 'a';
      expect(() => r.run({ kind: 'pick', userId: `p${i}` }, r.state.captains[other]!)).toThrow();
      expect(() => r.run({ kind: 'pick', userId: 'p0' }, r.state.captains[picker]!)).toThrow();
      r.run({ kind: 'pick', userId: `p${i}` }, r.state.captains[picker]!);
    }
    expect(r.state.phase).toBe('complete');
    expect(r.state.teams.a).toHaveLength(size); expect(r.state.teams.b).toHaveLength(size);
    expect(new Set([...r.state.teams.a, ...r.state.teams.b]).size).toBe(size * 2);
    expect(() => r.run({ kind: 'leave' }, 'p0')).toThrow();
    if (size === 6) expect(r.state.picks.map((p) => p.captain === r.state.first ? 'A' : 'B').join('')).toBe('ABBAABBAAB');
  });
  it('requires distinct captain consent and clears approval after roster changes', () => {
    const r = room(2);
    expect(() => r.run({ kind: 'skip', agree: true }, 'p0')).toThrow();
    r.run({ kind: 'team', seat: 'a' }, 'p2'); r.run({ kind: 'team', seat: 'b' }, 'p3');
    expect(() => r.run({ kind: 'skip', agree: true }, 'p2')).toThrow();
    r.run({ kind: 'skip', agree: true }, 'p0'); r.run({ kind: 'skip', agree: true }, 'p0');
    expect(r.state.phase).toBe('waiting'); expect(r.state.votes).toEqual(['a']);
    r.run({ kind: 'team', seat: null }, 'p2'); expect(r.state.votes).toEqual([]);
    r.run({ kind: 'team', seat: 'a' }, 'p2');
    r.run({ kind: 'skip', agree: true }, 'p1'); r.run({ kind: 'skip', agree: false }, 'p1');
    expect(r.state.votes).toEqual([]);
    r.run({ kind: 'skip', agree: true }, 'p0'); r.run({ kind: 'skip', agree: true }, 'p1');
    expect(r.state.phase).toBe('complete'); expect(r.state.winner).toBeNull();
  });
  it('rejects stale writes, overflow, duplicate players and captain seat theft without mutating state', () => {
    const r = room(2); const before = structuredClone(r.state);
    expect(() => r.run({ kind: 'toss' }, 'p0', 0)).toThrow(/changed/);
    expect(() => r.run({ kind: 'join' }, 'p2')).toThrow();
    expect(() => r.run({ kind: 'join' }, 'extra')).toThrow();
    expect(() => r.run({ kind: 'captain', seat: 'a' }, 'p2')).toThrow();
    expect(() => r.run({ kind: 'toss' }, 'p2')).toThrow();
    expect(r.state).toEqual(before);
  });
  it('resumes the same toss after a persisted snapshot is loaded', () => {
    const r = room(2); r.run({ kind: 'toss' }, 'p0');
    const loaded = JSON.parse(JSON.stringify(r.state)) as Formation;
    const next = applyFormationCommand(loaded, { kind: 'choice', advantage: 'first' }, 'p1', 2, loaded.seq, () => { throw new Error('Must not reroll'); });
    expect(next.winner).toBe('b'); expect(next.first).toBe('b');
  });
  it('blocks roster edits in PUG hero drafts even for moderators', () => {
    const state = createDraftState({ format: '2v2', bansPerTeam: 0, timerSeconds: 0, timeoutBehavior: 'skip', allowMirrorPicks: false, sequence: buildDefaultSequence('2v2', 0) }, { amber: 'p0', sapphire: 'p1' });
    state.rosterLocked = true;
    for (const cmd of [{ kind: 'joinTeam', team: 'amber' }, { kind: 'swapSides' }, { kind: 'leaveSeat' }, { kind: 'claimSeat', team: 'sapphire' }] as const) {
      expect(() => applyCommand(state, cmd, { userId: 'p0', isModerator: true }, { now: 0, heroIds: [] })).toThrow(/locked/);
    }
  });
});

describe('invite links', () => {
  it('seats a captain, fills the pool, and ignores a reopened link', () => {
    let s = newFormation();
    s = applyInvite(s, 'captainA', 'cap', 2);
    expect(s.captains.a).toBe('cap'); expect(s.players).toEqual(['cap']);
    expect(applyInvite(s, 'captainA', 'cap', 2)).toBe(s);
    s = applyInvite(s, 'player', 'p1', 2);
    expect(applyInvite(s, 'player', 'p1', 2)).toBe(s);
  });
  it('rejects a taken seat and keeps pool slots for the captains', () => {
    let s = applyInvite(newFormation(), 'captainA', 'cap', 2);
    expect(() => applyInvite(s, 'captainA', 'other', 2)).toThrow('occupied');
    s = applyInvite(applyInvite(s, 'player', 'p1', 2), 'player', 'p2', 2);
    expect(() => applyInvite(s, 'player', 'p3', 2)).toThrow('full');
    expect(applyInvite(s, 'captainB', 'capB', 2).captains.b).toBe('capB');
  });
  it('lets a pool player move into an open captain seat', () => {
    const s = applyInvite(applyInvite(newFormation(), 'player', 'p1', 2), 'captainB', 'p1', 2);
    expect(s.captains.b).toBe('p1'); expect(s.players).toEqual(['p1']);
  });
});

describe('toss and team names', () => {
  const ready = () => {
    let s = applyInvite(applyInvite(newFormation(), 'captainA', 'a', 2), 'captainB', 'b', 2);
    s = applyInvite(applyInvite(s, 'player', 'p1', 2), 'player', 'p2', 2);
    return applyFormationCommand(s, { kind: 'toss' }, 'a', 2, s.seq, () => 'a');
  };
  it('lets the winner take a side in one step and leaves first pick to the other captain', () => {
    const s = ready();
    const next = applyFormationCommand(s, { kind: 'choice', advantage: 'side', side: 'sapphire' }, 'a', 2, s.seq, () => 'a');
    expect(next.phase).toBe('picking'); expect(next.sides).toEqual({ a: 'sapphire', b: 'amber' }); expect(next.first).toBe('b');
  });
  it('gives the other captain the side when the winner takes first pick', () => {
    const s = ready();
    const next = applyFormationCommand(s, { kind: 'choice', advantage: 'first' }, 'a', 2, s.seq, () => 'a');
    expect(next.phase).toBe('side'); expect(next.first).toBe('a'); expect(next.sideChooser).toBe('b');
  });
  it('lets only captains name their own team, and blank restores the default', () => {
    const s = ready();
    const named = applyFormationCommand(s, { kind: 'teamName', name: 'Bandits' }, 'b', 2, s.seq, () => 'a');
    expect(named.teamNames).toEqual({ b: 'Bandits' });
    expect(applyFormationCommand(named, { kind: 'teamName', name: '' }, 'b', 2, named.seq, () => 'a').teamNames).toEqual({});
    expect(() => applyFormationCommand(s, { kind: 'teamName', name: 'X' }, 'p1', 2, s.seq, () => 'a')).toThrow('captain');
    expect(defaultTeamName('[SIM] Rafi')).toBe("Rafi's Team");
  });
});
