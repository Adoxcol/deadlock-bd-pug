import { describe, expect, it } from 'vitest';
import { classifyIdentifier } from '../src/tracker/identifier.js';
import { resolveIdentifier } from '../src/tracker/resolve.js';
import { createDeadlockApi, type DeadlockApi } from '../src/tracker/deadlockApi.js';
import { applyLiveEvent, emptyState, isStale, redactForPublic } from '../src/live/normalize.js';
import { teamElo, expectedScore } from '../src/rating/elo.js';
import { processResult, MemoryResultsRepo } from '../src/results/process.js';
import { deadlockLabsProvider, validateImport } from '../src/draft/providers.js';

const mockFetch = (routes: Record<string, [number, unknown]>): typeof fetch => (async (url: string) => {
  const path = new URL(url).pathname;
  const [status, body] = routes[path] ?? [404, {}];
  return new Response(JSON.stringify(body), { status });
}) as typeof fetch;

describe('identifier classification', () => {
  it('classifies', () => {
    expect(classifyIdentifier('38123456').kind).toBe('match');
    expect(classifyIdentifier('  #38123456 ').value).toBe('38123456');
    expect(classifyIdentifier('29384756102938475').kind).toBe('party');
    expect(classifyIdentifier('abc12').kind).toBe('party_code');
    expect(classifyIdentifier('99999999999999999999999').kind).toBe('unknown');
    expect(classifyIdentifier('0').kind).toBe('unknown');
    expect(classifyIdentifier('hello world!').kind).toBe('unknown');
    expect(classifyIdentifier('38123456', 'lobby').kind).toBe('lobby');
  });
});

describe('match ID resolution (mocked Deadlock API)', () => {
  const api = createDeadlockApi('https://mock.invalid', undefined, mockFetch({
    '/v1/matches/custom/123456789012345678/match-id': [200, { match_id: 41000001 }],
    '/v1/matches/41000001/metadata': [200, { match_info: {} }],
    '/v1/matches/custom/555555555555555555/match-id': [429, {}],
  }));
  it('resolves API-created party to match', async () => {
    const r = await resolveIdentifier(api, '123456789012345678', 'auto');
    expect(r).toMatchObject({ state: 'match_detected', matchId: '41000001' });
  });
  it('unknown party waits for match with explanation', async () => {
    expect((await resolveIdentifier(api, '111111111111111111', 'party')).state).toBe('waiting_for_match');
  });
  it('rate limit surfaces as api_unavailable', async () => {
    expect((await resolveIdentifier(api, '555555555555555555', 'party')).state).toBe('api_unavailable');
  });
  it('completed match and pending match', async () => {
    expect((await resolveIdentifier(api, '41000001', 'auto')).state).toBe('match_completed');
    expect((await resolveIdentifier(api, '41000002', 'auto')).state).toBe('match_detected');
  });
  it('lobby IDs require manual entry', async () => {
    expect((await resolveIdentifier(api, '41000001', 'lobby')).state).toBe('manual_required');
  });
  it('network failure is api_unavailable', async () => {
    const down: DeadlockApi = createDeadlockApi('https://x.invalid', undefined, (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch);
    expect((await resolveIdentifier(down, '41000001', 'match')).state).toBe('api_unavailable');
  });
});

describe('live event normalization', () => {
  it('normalizes players, keeps unknown metrics null, ignores out-of-order and duplicates', () => {
    const s = emptyState('1');
    applyLiveEvent(s, 'player_controller_entity_created', { tick: 10, entity_index: 3, steam_id: 7, steam_name: 'P', team: 2, hero_id: 15 });
    expect(s.players[3]!.kills).toBeNull(); expect(s.players[3]!.souls).toBeNull();
    applyLiveEvent(s, 'player_controller_entity_updated', { tick: 20, entity_index: 3, kills: 4, net_worth: 5000 });
    expect(applyLiveEvent(s, 'player_controller_entity_updated', { tick: 15, entity_index: 3, kills: 1 })).toBe(false);
    expect(s.players[3]!.kills).toBe(4);
    applyLiveEvent(s, 'hero_killed', { tick: 30, victim: 4, attacker: 3 });
    applyLiveEvent(s, 'hero_killed', { tick: 30, victim: 4, attacker: 3 });
    expect(s.timeline.filter((t) => t.kind === 'kill')).toHaveLength(1);
    applyLiveEvent(s, 'game_rules_proxy_entity_updated', { tick: 31, game_paused: false });
    applyLiveEvent(s, 'game_rules_proxy_entity_updated', { tick: 32, game_paused: true });
    expect(s.timeline.at(-1)!.kind).toBe('pause');
    applyLiveEvent(s, 'banned_heroes', { banned_hero_ids: [1, 2] });
    expect(s.bannedHeroIds).toEqual([1, 2]);
    applyLiveEvent(s, 'end', { tick: 40 });
    expect(s.completed).toBe(true);
  });
  it('public redaction hides positions and net worth; staleness', () => {
    const s = emptyState('1');
    applyLiveEvent(s, 'player_controller_entity_created', { tick: 1, entity_index: 1, hero_id: 2, net_worth: 900 }, 1000);
    applyLiveEvent(s, 'player_pawn_entity_updated', { tick: 2, hero_id: 2, position: [1, 2, 3] }, 1000);
    expect(s.players[1]!.position).toEqual([1, 2, 3]);
    const pub = redactForPublic(s);
    expect(pub.players[1]!.position).toBeNull(); expect(pub.players[1]!.netWorth).toBeNull();
    expect(isStale(s, 1000 + 20_000)).toBe(true); expect(isStale(s, 2000)).toBe(false);
  });
});

describe('rating', () => {
  it('team elo is zero-sum for equal K and favours upsets', () => {
    const w = [{ userId: 'a', rating: 1500, gamesPlayed: 20 }], l = [{ userId: 'b', rating: 1500, gamesPlayed: 20 }];
    const d = teamElo(w, l);
    expect(d.get('a')).toBe(12); expect(d.get('b')).toBe(-12);
    const upset = teamElo([{ userId: 'a', rating: 1300, gamesPlayed: 20 }], [{ userId: 'b', rating: 1700, gamesPlayed: 20 }]);
    expect(upset.get('a')!).toBeGreaterThan(20);
    expect(expectedScore(1500, 1500)).toBe(0.5);
  });
});

describe('result processing', () => {
  const base = { matchId: 'm1', seasonId: 's1', winners: ['a', 'b'], losers: ['c', 'd'] };
  it('is idempotent', async () => {
    const repo = new MemoryResultsRepo();
    const r1 = await processResult(repo, { ...base, source: 'API', verifiedBy: null });
    const r2 = await processResult(repo, { ...base, source: 'API', verifiedBy: null });
    expect(r1.status).toBe('rated'); expect(r2.status).toBe('duplicate');
    expect(repo.ratings.get('s1:a')!.gamesPlayed).toBe(1);
  });
  it('concurrent duplicate submissions rate once', async () => {
    const repo = new MemoryResultsRepo();
    const rs = await Promise.all([1, 2, 3].map(() => processResult(repo, { ...base, source: 'API', verifiedBy: null })));
    expect(rs.filter((r) => r.status === 'rated')).toHaveLength(1);
  });
  it('never rates unverified manual or simulated results', async () => {
    const repo = new MemoryResultsRepo();
    expect((await processResult(repo, { ...base, source: 'MANUAL', verifiedBy: null })).status).toBe('stored_unrated');
    expect((await processResult(repo, { ...base, matchId: 'm2', source: 'SIMULATED', verifiedBy: null })).status).toBe('stored_unrated');
    expect(repo.ratings.size).toBe(0);
    expect((await processResult(repo, { ...base, matchId: 'm3', source: 'MANUAL', verifiedBy: 'mod' })).status).toBe('rated');
  });
  it('rejects player on both teams', async () => {
    await expect(processResult(new MemoryResultsRepo(), { ...base, losers: ['a'], source: 'API', verifiedBy: null })).rejects.toThrow();
  });
});

describe('external draft providers', () => {
  it('validates URLs and imports', () => {
    expect(deadlockLabsProvider.validateUrl!('https://deadlocklabs.gg/draft-pick/abc')).toBe(true);
    expect(deadlockLabsProvider.validateUrl!('https://evil.gg/deadlocklabs.gg')).toBe(false);
    expect(deadlockLabsProvider.capabilities.subscribe).toBe(false);
    const heroes = [1, 2, 3, 4, 5, 6];
    expect(validateImport({ picks: { amber: [1, 2], sapphire: [3, 4] }, bans: { amber: [5], sapphire: [6] } }, 2, 1, heroes)).toEqual([]);
    expect(validateImport({ picks: { amber: [1, 1], sapphire: [3, 5] }, bans: { amber: [5], sapphire: [] } }, 2, 1, heroes).length).toBeGreaterThan(0);
  });
});

import { canRunCommand } from '../src/discord/commands.js';
import { atLeast, canAssignRole } from '../src/auth/rbac.js';
describe('permissions', () => {
  it('discord command authorization', () => {
    expect(canRunCommand('pug create', 'PLAYER')).toBe(false);
    expect(canRunCommand('pug create', 'MODERATOR')).toBe(true);
    expect(canRunCommand('pug create', undefined)).toBe(false);
    expect(canRunCommand('leaderboard', undefined)).toBe(true);
    expect(canRunCommand('draft create', 'CAPTAIN')).toBe(true);
    expect(canRunCommand('nope', 'OWNER')).toBe(false);
  });
  it('role hierarchy', () => {
    expect(atLeast('ADMIN', 'MODERATOR')).toBe(true);
    expect(atLeast('CAPTAIN', 'MODERATOR')).toBe(false);
    expect(canAssignRole('ADMIN', 'OWNER')).toBe(false);
    expect(canAssignRole('ADMIN', 'MODERATOR')).toBe(true);
    expect(canAssignRole('MODERATOR', 'PLAYER')).toBe(false);
  });
});
