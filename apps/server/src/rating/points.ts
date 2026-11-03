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
/** Matches that calibrate a rating. It stays hidden until then, but already counts towards team averages. */
export const CALIBRATION_MATCHES = 5;

/** Average points per match x20. Unplayed calibration matches count at the starting rating, so it is purely the player's own from match 5 on. */
export function skillRating(rows: PointsInput[]): number {
  const total = rows.reduce((n, r) => n + basePoints(r), 0);
  const unplayed = Math.max(0, CALIBRATION_MATCHES - rows.length);
  return Math.round(((total + unplayed * (STARTING_RATING / 20)) / (rows.length + unplayed)) * 20);
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
