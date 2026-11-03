/** Per-player stats kept from final match metadata. A value the API did not send stays null, never 0. */
export interface PlayerDetails {
  level: number | null; lastHits: number | null; denies: number | null;
  playerDamage: number | null; objectiveDamage: number | null; damageTaken: number | null; damageMitigated: number | null;
  healing: number | null; selfHealing: number | null; teammateHealing: number | null;
  shotsHit: number | null; shotsMissed: number | null; headshotKills: number | null;
  bulletKills: number | null; meleeKills: number | null; abilityKills: number | null;
  soulSources: { heroes: number | null; laneCreeps: number | null; neutrals: number | null; bosses: number | null; treasure: number | null };
  items: { t: number; id: number; soldAt: number | null }[];
  timeline: { t: number; souls: number; damage: number }[];
}
export interface NormalizedPlayer { accountId: string; heroId: number | null; kills: number | null; deaths: number | null; assists: number | null; netWorth: number | null; heroDamage: number | null; details: PlayerDetails }
export interface NormalizedMatch { durationSec: number | null; players: NormalizedPlayer[] }

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? v as Raw : {});
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
/** Sum of the fields that exist; null only when none of them do. */
const total = (o: Raw, ...keys: string[]): number | null => {
  const vals = keys.map((k) => num(o[k])).filter((n): n is number => n !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

const boardHealing = (s: Raw): number | null => {
  const gained = total(s, 'player_healing', 'player_barriering');
  return gained === null ? null : Math.max(0, gained - (num(s.self_damage) ?? 0));
};

/** Reads GET /v1/matches/{id}/metadata. `stats` holds cumulative snapshots, so the last one is the final total. */
export function normalizeMetadata(raw: unknown): NormalizedMatch | null {
  const info = obj(obj(raw).match_info);
  const players = list(info.players);
  if (!players.length) return null;
  return {
    durationSec: num(info.duration_s),
    players: players.filter((p) => num(p.account_id) !== null).map((p) => {
      const snaps = list(p.stats);
      const last = snaps[snaps.length - 1] ?? {};
      return {
        accountId: String(p.account_id), heroId: num(p.hero_id), kills: num(p.kills), deaths: num(p.deaths), assists: num(p.assists),
        netWorth: num(p.net_worth), heroDamage: num(last.player_damage),
        details: {
          level: num(p.level), lastHits: num(p.last_hits), denies: num(p.denies),
          playerDamage: num(last.player_damage), objectiveDamage: num(last.boss_damage), damageTaken: num(last.player_damage_taken), damageMitigated: num(last.damage_mitigated),
          // The in-game Healing column is healing + barriers - self damage (all 12 players of match 129343601 agree).
          healing: boardHealing(last), selfHealing: num(last.self_healing), teammateHealing: num(last.teammate_healing),
          shotsHit: num(last.shots_hit), shotsMissed: num(last.shots_missed), headshotKills: num(last.headshot_kills),
          bulletKills: num(last.bullet_kills), meleeKills: num(last.melee_kills), abilityKills: num(last.ability_kills),
          soulSources: {
            heroes: total(last, 'gold_player', 'gold_player_orbs'), laneCreeps: total(last, 'gold_lane_creep', 'gold_lane_creep_orbs'),
            neutrals: total(last, 'gold_neutral_creep', 'gold_neutral_creep_orbs'), bosses: total(last, 'gold_boss', 'gold_boss_orb'), treasure: total(last, 'gold_treasure'),
          },
          items: list(p.items).flatMap((i) => {
            const id = num(i.item_id), t = num(i.game_time_s), sold = num(i.sold_time_s);
            return id === null || t === null ? [] : [{ t, id, soldAt: sold ? sold : null }];
          }),
          timeline: snaps.flatMap((s) => {
            const t = num(s.time_stamp_s), souls = num(s.net_worth), damage = num(s.player_damage);
            return t === null || souls === null || damage === null ? [] : [{ t, souls, damage }];
          }),
        },
      };
    }),
  };
}

/** Pairs metadata with our stat rows: linked Steam account first, then the row's drafted hero. */
export function matchPlayers<R extends { id: string; userId: string | null; heroId: number | null }>(rows: R[], accountByUser: Map<string, string>, players: NormalizedPlayer[]): { row: R; player: NormalizedPlayer }[] {
  const left = [...players];
  const take = (test: (p: NormalizedPlayer) => boolean) => { const i = left.findIndex(test); return i < 0 ? null : left.splice(i, 1)[0]!; };
  const out: { row: R; player: NormalizedPlayer }[] = [];
  const pending: R[] = [];
  for (const row of rows) {
    const account = row.userId ? accountByUser.get(row.userId) : undefined;
    const player = account ? take((p) => p.accountId === account) : null;
    if (player) out.push({ row, player }); else pending.push(row);
  }
  for (const row of pending) {
    const player = row.heroId === null ? null : take((p) => p.heroId === row.heroId);
    if (player) out.push({ row, player });
  }
  return out;
}

/** Simulated stats in the same shape, so the page can be seen working before a real match. */
export function simulateDetails(p: { kills: number; deaths: number; assists: number; netWorth: number; heroDamage: number }, durationSec: number, itemIds: number[], rng: () => number = Math.random): PlayerDetails {
  const int = (a: number, b: number) => Math.round(a + rng() * (b - a));
  const steps = 12;
  let souls = 0, damage = 0;
  const weights = Array.from({ length: steps }, (_, i) => 1 + i * 0.25 + rng());
  const sum = weights.reduce((a, b) => a + b, 0);
  const timeline = weights.map((w, i) => {
    souls += (p.netWorth * w) / sum; damage += (p.heroDamage * w) / sum;
    return { t: Math.round((durationSec * (i + 1)) / steps), souls: Math.round(souls), damage: Math.round(damage) };
  });
  const pool = [...itemIds];
  const count = Math.min(pool.length, int(8, 12));
  const items = Array.from({ length: count }, (_, i) => ({ t: Math.round(((i + 0.5 + rng() * 0.5) / count) * durationSec * 0.9), id: pool.splice(Math.floor(rng() * pool.length), 1)[0]!, soldAt: null as number | null }));
  if (items.length > 3) items[0]!.soldAt = Math.round(durationSec * 0.7);
  const heroes = Math.round(p.netWorth * (0.25 + rng() * 0.15)), laneCreeps = Math.round(p.netWorth * (0.25 + rng() * 0.1)), bosses = Math.round(p.netWorth * rng() * 0.1), treasure = Math.round(p.netWorth * rng() * 0.05);
  const shots = int(600, 1800), hit = Math.round(shots * (0.25 + rng() * 0.3));
  const bulletKills = Math.round(p.kills * rng()), abilityKills = Math.round((p.kills - bulletKills) * (0.6 + rng() * 0.4));
  const healing = int(1000, 14000);
  return {
    level: int(22, 34), lastHits: int(90, 320), denies: int(5, 60),
    playerDamage: p.heroDamage, objectiveDamage: int(1500, 16000), damageTaken: int(14000, 42000), damageMitigated: int(3000, 16000),
    healing, selfHealing: Math.round(healing * (0.4 + rng() * 0.5)), teammateHealing: Math.round(healing * rng() * 0.3),
    shotsHit: hit, shotsMissed: shots - hit, headshotKills: Math.round(bulletKills * rng()),
    bulletKills, meleeKills: p.kills - bulletKills - abilityKills, abilityKills,
    soulSources: { heroes, laneCreeps, neutrals: Math.max(0, p.netWorth - heroes - laneCreeps - bosses - treasure), bosses, treasure },
    items: items.sort((a, b) => a.t - b.t), timeline,
  };
}
