import type { PrismaClient, Prisma } from '@prisma/client';
import type { ResultInput, ResultsRepo, RatingRow } from '../results/process.js';

type Tx = Prisma.TransactionClient;
export class PrismaResultsRepo implements ResultsRepo {
  constructor(private db: PrismaClient | Tx, private winnerSide: (matchId: string) => 'AMBER' | 'SAPPHIRE' = () => 'AMBER') {}
  async tx<T>(fn: (r: ResultsRepo) => Promise<T>): Promise<T> {
    if (!('$transaction' in this.db)) return fn(this);
    return (this.db as PrismaClient).$transaction((tx) => fn(new PrismaResultsRepo(tx, this.winnerSide)), { isolationLevel: 'Serializable' });
  }
  async hasResult(matchId: string) { return !!(await this.db.matchResult.findUnique({ where: { matchId } })); }
  async insertResult(i: ResultInput, rated: boolean) {
    await this.db.matchResult.create({ data: {
      matchId: i.matchId, seasonId: i.seasonId, winner: this.winnerSide(i.matchId), source: i.source,
      verified: i.source === 'API' || !!i.verifiedBy, verifiedById: i.verifiedBy, rated,
    } });
  }
  async getRatings(seasonId: string, userIds: string[], initial: number): Promise<RatingRow[]> {
    const rows = await this.db.playerRating.findMany({ where: { seasonId, userId: { in: userIds } } });
    const by = new Map(rows.map((r) => [r.userId, r]));
    return userIds.map((u) => by.get(u) ?? { userId: u, rating: initial, gamesPlayed: 0, wins: 0, losses: 0 });
  }
  async applyRating(seasonId: string, matchId: string, userId: string, delta: number, before: number, won: boolean) {
    await this.db.ratingTransaction.create({ data: { seasonId, matchId, userId, before, delta, after: before + delta } });
    await this.db.playerRating.upsert({
      where: { seasonId_userId: { seasonId, userId } },
      create: { seasonId, userId, rating: before + delta, gamesPlayed: 1, wins: won ? 1 : 0, losses: won ? 0 : 1 },
      update: { rating: before + delta, gamesPlayed: { increment: 1 }, wins: { increment: won ? 1 : 0 }, losses: { increment: won ? 0 : 1 } },
    });
  }
}
