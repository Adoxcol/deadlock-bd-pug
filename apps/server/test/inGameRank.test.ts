import { describe, expect, it } from 'vitest';
import { compareInGame, isInactive, rankFields, refreshInGameRanks, topHeroes } from '../src/tracker/inGameRank.js';
import { createDeadlockApi } from '../src/tracker/deadlockApi.js';

const row = (o: object) => ({ gameRank: 9, gameSubrank: 2, gameRankPoints: 100, ...o });

describe('in-game rank', () => {
  it('reads a ranked player', () => {
    expect(rankFields({ account_id: 1, rank: 9, subrank: 2, last_match: { start_time: 1000, player_rank_final_flat_progress: 57000 } }))
      .toEqual({ gameRank: 9, gameSubrank: 2, gameRankPoints: 57000, lastRankedAt: new Date(1_000_000) });
  });
  it('ignores a row without a rank', () => {
    expect(rankFields({ account_id: 1, rank: 0, subrank: 0, last_match: null })).toBeNull();
  });
  it('orders by rank, then subrank, then points, with missing points last', () => {
    const list = [row({ gameRank: 8, gameSubrank: 6, gameRankPoints: 999 }), row({ gameRankPoints: null }), row({ gameSubrank: 3, gameRankPoints: 1 }), row({})];
    expect(list.sort(compareInGame).map((r) => [r.gameRank, r.gameSubrank, r.gameRankPoints])).toEqual([[9, 3, 1], [9, 2, 100], [9, 2, null], [8, 6, 999]]);
  });
  it('marks players with no ranked match in 30 days as inactive', () => {
    const now = new Date('2026-11-04T00:00:00Z');
    expect(isInactive(new Date('2026-11-01T00:00:00Z'), now)).toBe(false);
    expect(isInactive(new Date('2026-09-01T00:00:00Z'), now)).toBe(true);
    expect(isInactive(null, now)).toBe(true);
  });
  it('keeps the last known rank when the API has none, and stops on failure', async () => {
    const updates: any[] = [];
    const db = { steamAccount: { findMany: async () => [{ id: 'a', accountId: '1' }, { id: 'b', accountId: '2' }], update: async (u: any) => updates.push(u) } } as any;
    const now = new Date();
    const none = { ok: false as const, status: 'unavailable' as const, message: 'down' };
    const extras = { playerProfiles: async () => none, playerHeroStats: async () => none };
    await refreshInGameRanks(db, { ...extras, playerRanks: async () => ({ ok: true, data: [{ account_id: 1, rank: 5, subrank: 1, last_match: null }, { account_id: 2, rank: 0, subrank: 0, last_match: null }] }) }, now);
    expect(updates[0].data).toMatchObject({ gameRank: 5, rankCheckedAt: now });
    expect(updates[1].data).toEqual({ rankCheckedAt: now });
    updates.length = 0;
    await refreshInGameRanks(db, { ...extras, playerRanks: async () => none }, now);
    expect(updates).toEqual([]);
  });
  it('stores the picture and top hero when they arrive', async () => {
    const updates: any[] = [];
    const db = { steamAccount: { findMany: async () => [{ id: 'a', userId: 'u', accountId: '1', avatarUrl: 'same' }], update: async (u: any) => updates.push(u) } } as any;
    await refreshInGameRanks(db, {
      playerRanks: async () => ({ ok: true, data: [{ account_id: 1, rank: 5, subrank: 1, last_match: null }] }),
      playerProfiles: async () => ({ ok: true, data: [{ account_id: 1, avatarfull: 'same' }] }),
      playerHeroStats: async () => ({ ok: true, data: [{ account_id: 1, hero_id: 7, matches_played: 9 }] }),
    });
    expect(updates[0].data).toMatchObject({ avatarUrl: 'same', gameTopHeroId: 7 });
  });
  it('picks the hero with the most matches per account', () => {
    const m = topHeroes([{ account_id: 1, hero_id: 2, matches_played: 3 }, { account_id: 1, hero_id: 4, matches_played: 8 }, { account_id: 2, hero_id: 6, matches_played: 1 }]);
    expect([...m]).toEqual([['1', 4], ['2', 6]]);
  });
  it('asks the API for all the accounts in one request', async () => {
    let asked = '';
    const api = createDeadlockApi('https://m.invalid', undefined, (async (u: string) => { asked = u; return new Response('[]', { status: 200 }); }) as unknown as typeof fetch);
    expect(await api.playerRanks(['1', '2'])).toEqual({ ok: true, data: [] });
    expect(asked).toBe('https://m.invalid/v1/players/rank?account_ids=1,2');
  });
});
