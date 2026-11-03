/** A finished match rebuilt for the replay page. Positions are world units, one sample per second. */
export interface ReplayPlayer {
  slot: number; heroId: number | null; team: 'amber' | 'sapphire'; x: number[]; y: number[]; health: number[];
  souls: { t: number; v: number }[]; items: { t: number; id: number }[];
}
export interface ReplayDeath { t: number; victim: number; killer: number | null; x: number; y: number; respawn: number }
export interface ReplayData {
  durationSec: number; players: ReplayPlayer[]; deaths: ReplayDeath[];
  objectives: { t: number; team: 'amber' | 'sapphire'; id: number }[];
  midBoss: { t: number; team: 'amber' | 'sapphire' | null }[];
  pauses: { t: number; seconds: number }[];
}

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? v as Raw : {});
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map((n) => num(n) ?? 0) : []);
const side = (v: unknown): 'amber' | 'sapphire' | null => (v === 0 ? 'amber' : v === 1 ? 'sapphire' : null);

/** Reads match_paths from match metadata; null when the match has no position data. */
export function normalizeReplay(raw: unknown): ReplayData | null {
  const info = obj(obj(raw).match_info);
  const mp = obj(info.match_paths);
  const paths = new Map(list(mp.paths).map((p) => [num(p.player_slot), p]));
  const xRes = num(mp.x_resolution), yRes = num(mp.y_resolution), duration = num(info.duration_s);
  if (!paths.size || !xRes || !yRes || duration === null) return null;

  const players = list(info.players).flatMap((p): ReplayPlayer[] => {
    const slot = num(p.player_slot), team = side(p.team), path = paths.get(slot);
    if (slot === null || !team || !path) return [];
    // Each player's path is scaled to that player's own bounds.
    const world = (pos: unknown, min: unknown, max: unknown, res: number) => {
      const lo = num(min) ?? 0, hi = num(max) ?? 0;
      return nums(pos).map((n) => Math.round(lo + (n / res) * (hi - lo)));
    };
    return [{
      slot, heroId: num(p.hero_id), team,
      x: world(path.x_pos, path.x_min, path.x_max, xRes), y: world(path.y_pos, path.y_min, path.y_max, yRes), health: nums(path.health),
      souls: list(p.stats).flatMap((s) => { const t = num(s.time_stamp_s), v = num(s.net_worth); return t === null || v === null ? [] : [{ t, v }]; }),
      items: list(p.items).flatMap((i) => { const t = num(i.game_time_s), id = num(i.item_id); return t === null || id === null ? [] : [{ t, id }]; }),
    }];
  });
  if (!players.length) return null;

  const deaths = list(info.players).flatMap((p) => list(p.death_details).flatMap((d): ReplayDeath[] => {
    const t = num(d.game_time_s), victim = num(p.player_slot), pos = obj(d.death_pos), x = num(pos.x), y = num(pos.y);
    if (t === null || victim === null || x === null || y === null) return [];
    return [{ t, victim, killer: num(d.killer_player_slot) || null, x: Math.round(x), y: Math.round(y), respawn: num(d.death_duration_s) ?? 0 }];
  })).sort((a, b) => a.t - b.t);

  return {
    durationSec: duration, players, deaths,
    objectives: list(info.objectives).flatMap((o) => {
      const t = num(o.destroyed_time_s), team = side(o.team), id = num(o.team_objective_id);
      return t && team && id !== null ? [{ t, team, id }] : [];
    }).sort((a, b) => a.t - b.t),
    midBoss: list(info.mid_boss).flatMap((b) => { const t = num(b.destroyed_time_s); return t ? [{ t, team: side(b.team_claimed) }] : []; }),
    pauses: list(info.match_pauses).flatMap((p) => { const t = num(p.game_time_s), seconds = num(p.pause_duration_s); return t !== null && seconds ? [{ t, seconds }] : []; }),
  };
}
