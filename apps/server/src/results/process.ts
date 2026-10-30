import { teamElo, DEFAULT_ELO, type EloConfig } from '../rating/elo.js';

export type ResultSource = 'API' | 'MANUAL' | 'SIMULATED';
export interface ResultInput {
  matchId: string; seasonId: string; source: ResultSource; verifiedBy: string | null;
  winners: string[]; losers: string[]; // internal user IDs
}
export interface RatingRow { userId: string; rating: number; gamesPlayed: number; wins: number; losses: number }
export interface ResultsRepo {
  /** Runs fn atomically (DB transaction). */
  tx<T>(fn: (r: ResultsRepo) => Promise<T>): Promise<T>;
  hasResult(matchId: string): Promise<boolean>;
  insertResult(input: ResultInput, rated: boolean): Promise<void>; // unique(matchId) enforced by DB
  getRatings(seasonId: string, userIds: string[], initial: number): Promise<RatingRow[]>;
  applyRating(seasonId: string, matchId: string, userId: string, delta: number, before: number, won: boolean): Promise<void>; // unique(matchId,userId,seasonId)
}

export type ProcessOutcome = { status: 'duplicate' } | { status: 'stored_unrated'; reason: string } | { status: 'rated'; deltas: Record<string, number> };

/** Idempotent: a match is processed at most once; ratings only from verified, non-simulated results. */
export async function processResult(repo: ResultsRepo, input: ResultInput, opts: { elo?: EloConfig; initialRating?: number; allowSimulated?: boolean } = {}): Promise<ProcessOutcome> {
  if (!input.winners.length || !input.losers.length) throw new Error('Both teams must have players');
  if (input.winners.some((w) => input.losers.includes(w))) throw new Error('A player cannot be on both teams');
  return repo.tx(async (r) => {
    if (await r.hasResult(input.matchId)) return { status: 'duplicate' } as const;
    const verified = input.source === 'API' || (input.source === 'MANUAL' && !!input.verifiedBy);
    const simulatedBlocked = input.source === 'SIMULATED' && !opts.allowSimulated;
    const rated = (verified || input.source === 'SIMULATED') && !simulatedBlocked;
    await r.insertResult(input, rated);
    if (!rated) return { status: 'stored_unrated', reason: simulatedBlocked ? 'Simulated results never affect ratings' : 'Result not verified' } as const;
    const rows = await r.getRatings(input.seasonId, [...input.winners, ...input.losers], opts.initialRating ?? 1500);
    const by = new Map(rows.map((x) => [x.userId, x]));
    const pick = (ids: string[]) => ids.map((id) => ({ userId: id, rating: by.get(id)!.rating, gamesPlayed: by.get(id)!.gamesPlayed }));
    const deltas = teamElo(pick(input.winners), pick(input.losers), opts.elo ?? DEFAULT_ELO);
    for (const [userId, d] of deltas) await r.applyRating(input.seasonId, input.matchId, userId, d, by.get(userId)!.rating, input.winners.includes(userId));
    return { status: 'rated', deltas: Object.fromEntries(deltas) } as const;
  });
}

export class MemoryResultsRepo implements ResultsRepo {
  results = new Map<string, { input: ResultInput; rated: boolean }>();
  ratings = new Map<string, RatingRow>();
  tx_ = Promise.resolve() as Promise<unknown>;
  async tx<T>(fn: (r: ResultsRepo) => Promise<T>): Promise<T> { const p: Promise<T> = this.tx_.then(() => fn(this)); this.tx_ = p.catch(() => {}); return p; }
  async hasResult(id: string) { return this.results.has(id); }
  async insertResult(input: ResultInput, rated: boolean) { if (this.results.has(input.matchId)) throw new Error('unique'); this.results.set(input.matchId, { input, rated }); }
  async getRatings(season: string, ids: string[], initial: number) {
    return ids.map((id) => this.ratings.get(`${season}:${id}`) ?? { userId: id, rating: initial, gamesPlayed: 0, wins: 0, losses: 0 });
  }
  async applyRating(season: string, _m: string, userId: string, delta: number, before: number, won: boolean) {
    const k = `${season}:${userId}`; const cur = this.ratings.get(k) ?? { userId, rating: before, gamesPlayed: 0, wins: 0, losses: 0 };
    this.ratings.set(k, { ...cur, rating: before + delta, gamesPlayed: cur.gamesPlayed + 1, wins: cur.wins + (won ? 1 : 0), losses: cur.losses + (won ? 0 : 1) });
  }
}
