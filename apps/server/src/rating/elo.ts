/**
 * Team Elo. Each team's strength is the mean rating of its players; every player on a team
 * receives the same delta. Individual K/D/A never affects rating (see docs/RATING.md).
 */
export interface EloConfig { k: number; provisionalK: number; provisionalGames: number; scale: number }
export const DEFAULT_ELO: EloConfig = { k: 24, provisionalK: 40, provisionalGames: 10, scale: 400 };

export interface RatedPlayer { userId: string; rating: number; gamesPlayed: number }

export function expectedScore(a: number, b: number, scale = 400): number {
  return 1 / (1 + 10 ** ((b - a) / scale));
}

export function teamElo(winners: RatedPlayer[], losers: RatedPlayer[], cfg: EloConfig = DEFAULT_ELO): Map<string, number> {
  if (!winners.length || !losers.length) throw new Error('Both teams need players');
  const mean = (xs: RatedPlayer[]) => xs.reduce((a, p) => a + p.rating, 0) / xs.length;
  const ew = expectedScore(mean(winners), mean(losers), cfg.scale);
  const out = new Map<string, number>();
  const k = (p: RatedPlayer) => (p.gamesPlayed < cfg.provisionalGames ? cfg.provisionalK : cfg.k);
  for (const p of winners) out.set(p.userId, Math.round(k(p) * (1 - ew)));
  for (const p of losers) out.set(p.userId, -Math.round(k(p) * (1 - ew)));
  return out;
}
