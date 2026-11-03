import { describe, expect, it } from 'vitest';
import { matchPlayers, normalizeMetadata, simulateDetails } from '../src/tracker/matchStats.js';

const raw = { match_info: { duration_s: 1800, players: [{
  account_id: 11, hero_id: 7, kills: 5, deaths: 2, assists: 9, net_worth: 30000, level: 30, last_hits: 200, denies: 12,
  items: [{ game_time_s: 60, item_id: 100, sold_time_s: 0 }, { game_time_s: 900, item_id: 101, sold_time_s: 1200 }],
  stats: [
    { time_stamp_s: 600, net_worth: 8000, player_damage: 4000, boss_damage: 1 },
    { time_stamp_s: 1800, net_worth: 30000, player_damage: 25000, boss_damage: 9000, player_healing: 700, gold_player: 100, gold_player_orbs: 50, gold_treasure: 0 },
  ],
}] } };

describe('normalizeMetadata', () => {
  it('reads totals from the final snapshot', () => {
    const p = normalizeMetadata(raw)!.players[0]!;
    expect(p).toMatchObject({ accountId: '11', heroId: 7, heroDamage: 25000 });
    expect(p.details).toMatchObject({ level: 30, lastHits: 200, objectiveDamage: 9000, healing: 700 });
    expect(p.details.soulSources.heroes).toBe(150);
    expect(p.details.timeline).toHaveLength(2);
    expect(p.details.items).toEqual([{ t: 60, id: 100, soldAt: null }, { t: 900, id: 101, soldAt: 1200 }]);
  });
  it('keeps a real zero but leaves missing values null', () => {
    const d = normalizeMetadata(raw)!.players[0]!.details;
    expect(d.soulSources.treasure).toBe(0);
    expect(d.damageTaken).toBeNull();
    expect(d.soulSources.bosses).toBeNull();
  });
  it('returns null when there are no players', () => {
    expect(normalizeMetadata({})).toBeNull();
    expect(normalizeMetadata({ match_info: { players: [] } })).toBeNull();
  });
});

describe('matchPlayers', () => {
  const player = (accountId: string, heroId: number) => ({ ...normalizeMetadata(raw)!.players[0]!, accountId, heroId });
  it('prefers the linked account over the hero, and uses each player once', () => {
    const rows = [{ id: 'a', userId: 'u1', heroId: 2 }, { id: 'b', userId: 'u2', heroId: 2 }, { id: 'c', userId: null, heroId: 9 }];
    const out = matchPlayers(rows, new Map([['u1', '50']]), [player('60', 2), player('50', 1)]);
    expect(out.map((o) => [o.row.id, o.player.accountId])).toEqual([['a', '50'], ['b', '60']]);
  });
});

describe('simulateDetails', () => {
  it('adds up to the scoreboard numbers', () => {
    const d = simulateDetails({ kills: 8, deaths: 3, assists: 4, netWorth: 30000, heroDamage: 20000 }, 1350, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(d.timeline.at(-1)).toMatchObject({ t: 1350, souls: 30000, damage: 20000 });
    expect(Object.values(d.soulSources).reduce((a, b) => a! + b!, 0)).toBe(30000);
    expect(d.bulletKills! + d.meleeKills! + d.abilityKills!).toBe(8);
    expect(new Set(d.items.map((i) => i.id)).size).toBe(d.items.length);
  });
});
