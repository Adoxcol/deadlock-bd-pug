import { describe, expect, it } from 'vitest';
import { normalizeReplay } from '../src/tracker/replay.js';

const raw = { match_info: {
  duration_s: 3, winning_team: 1,
  match_paths: { x_resolution: 100, y_resolution: 100, paths: [{ player_slot: 1, x_min: -100, x_max: 100, y_min: 0, y_max: 50, x_pos: [0, 50, 100], y_pos: [100, 0, 50], health: [100, 50, 0] }] },
  players: [{ player_slot: 1, team: 0, hero_id: 7, stats: [{ time_stamp_s: 3, net_worth: 900 }], items: [{ game_time_s: 2, item_id: 5 }],
    death_details: [{ game_time_s: 3, killer_player_slot: 0, death_pos: { x: 10.4, y: 20.6 }, death_duration_s: 14 }] }],
  objectives: [{ destroyed_time_s: 0, team: 1, team_objective_id: 9 }, { destroyed_time_s: 2, team: 1, team_objective_id: 1 }],
  mid_boss: [{ team_claimed: 1, destroyed_time_s: 2 }], match_pauses: [{ game_time_s: 1, pause_duration_s: 0 }, { game_time_s: 1, pause_duration_s: 30 }],
} };

describe('normalizeReplay', () => {
  it('converts each path from its own bounds to world units', () => {
    const p = normalizeReplay(raw)!.players[0]!;
    expect(p).toMatchObject({ slot: 1, team: 'amber', heroId: 7, x: [-100, 0, 100], y: [50, 0, 25], health: [100, 50, 0] });
  });
  it('keeps only events that happened', () => {
    const r = normalizeReplay(raw)!;
    expect(r.objectives).toEqual([{ t: 2, team: 'sapphire', id: 1 }]);
    expect(r.pauses).toEqual([{ t: 1, seconds: 30 }]);
    expect(r.midBoss).toEqual([{ t: 2, team: 'sapphire' }]);
    expect(r.deaths).toEqual([{ t: 3, victim: 1, killer: null, x: 10, y: 21, respawn: 14 }]);
  });
  it('returns null without position data', () => {
    expect(normalizeReplay({ match_info: { duration_s: 3, players: [] } })).toBeNull();
  });
});
