import { CALIBRATION_MATCHES, heroSummary, skillRating, standings, type PointsInput } from '../rating/points.js';

export type WeeklyRow = PointsInput & { userId: string; heroId: number | null };
export interface Weekly { top: { userId: string; points: number; wins: number; losses: number }; improver: { userId: string; gain: number } | null; hero: { heroId: number; matches: number } | null; matches: number }

/** The post goes out Monday 12:00 UTC (18:00 in Dhaka) and covers the seven days before it. */
export function weekBoundary(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (d > now) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

/** A newcomer's rating moves mostly because calibration ends, so improvers need a calibrated start and two games this week. */
export function weeklyHighlights(week: WeeklyRow[], before: WeeklyRow[], matches: number): Weekly | null {
  const [top] = standings(week);
  if (!top) return null;
  let improver: Weekly['improver'] = null;
  for (const userId of new Set(week.map((r) => r.userId))) {
    const mine = week.filter((r) => r.userId === userId), prior = before.filter((r) => r.userId === userId);
    if (mine.length < 2 || prior.length < CALIBRATION_MATCHES) continue;
    const gain = skillRating([...prior, ...mine]) - skillRating(prior);
    if (gain > 0 && (!improver || gain > improver.gain)) improver = { userId, gain };
  }
  const [hero] = heroSummary(week.map((r) => ({ heroId: r.heroId, won: r.won, kills: r.kills, deaths: r.deaths, assists: r.assists })));
  return { top: { userId: top.userId, points: top.points, wins: top.wins, losses: top.losses }, improver, hero: hero ? { heroId: hero.heroId, matches: hero.matches } : null, matches };
}
