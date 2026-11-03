/** PUG points for one match (see docs/RATING.md). Derived from stored stats, so late-arriving stats just count. */
export interface PointsInput { won: boolean; kills: number | null; deaths: number | null; assists: number | null; netWorth: number | null; bonus?: number }

/** Earned from play alone. Ratings use this, so an underdog bonus can never inflate the rating that produced it. */
export function basePoints(s: PointsInput): number {
  const raw = (s.won ? 30 : 10) + 2 * (s.kills ?? 0) + (s.assists ?? 0) - (s.deaths ?? 0) + (s.netWorth ?? 0) / 2000;
  return Math.max(0, Math.round(raw));
}

export function matchPoints(s: PointsInput): number {
  return basePoints(s) + (s.bonus ?? 0);
}

export const STARTING_RATING = 1200;
export const RANKS: Array<[number, string]> = [[1700, 'Eternus'], [1500, 'Archon'], [1300, 'Arcanist'], [1100, 'Alchemist'], [900, 'Seeker'], [0, 'Initiate']];
export const rankOf = (rating: number) => RANKS.find(([min]) => rating >= min)![1];

/** Average points per match x20, pulled toward the starting rating until a player has a few games. */
export function skillRating(rows: PointsInput[]): number {
  const total = rows.reduce((n, r) => n + basePoints(r), 0);
  return Math.round(((total + 5 * (STARTING_RATING / 20)) / (rows.length + 5)) * 20);
}

/** The lower-rated team earns +1 per 10 rating of average gap, up to 20, or half that if it loses. */
export function underdogBonus(team: 'AMBER' | 'SAPPHIRE', won: boolean, amberRating: number | null, sapphireRating: number | null): number {
  if (amberRating === null || sapphireRating === null) return 0;
  const gap = team === 'AMBER' ? sapphireRating - amberRating : amberRating - sapphireRating;
  if (gap <= 0) return 0;
  const full = Math.min(20, Math.round(gap / 10));
  return won ? full : Math.round(full / 2);
}

export interface Standing { userId: string; points: number; matches: number; wins: number; losses: number }

/** Ranked by points, then win count. Rows without a user (guests) earn nothing. */
export function standings(rows: Array<PointsInput & { userId: string | null }>): Standing[] {
  const by = new Map<string, Standing>();
  for (const r of rows) {
    if (!r.userId) continue;
    const s = by.get(r.userId) ?? { userId: r.userId, points: 0, matches: 0, wins: 0, losses: 0 };
    s.points += matchPoints(r); s.matches++;
    if (r.won) s.wins++; else s.losses++;
    by.set(r.userId, s);
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
}
