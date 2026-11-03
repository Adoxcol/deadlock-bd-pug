import type { Prisma, PrismaClient } from '@prisma/client';
import { normalizeMetadata, type NormalizedPlayer } from '../tracker/matchStats.js';
import type { DeadlockApi } from '../tracker/deadlockApi.js';
import { skillRating } from '../rating/points.js';

const STEAM_ID_OFFSET = 76561197960265728n;
const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
type Side = 'AMBER' | 'SAPPHIRE';
interface Fetched { startedAt: Date; durationSec: number | null; winner: Side; players: (NormalizedPlayer & { team: Side })[] }

/** Team and winner are read from the raw metadata (0 = the Hidden King = Amber); the API publishes no player names. */
async function fetchMatch(api: DeadlockApi, matchId: string): Promise<Fetched> {
  const r = await api.matchMetadata(matchId);
  if (!r.ok) throw fail(r.status === 'not_found' ? 404 : 502, r.status === 'not_found' ? 'Stats are not published for this match yet.' : r.message);
  const meta = normalizeMetadata(r.data);
  const info = (r.data as { match_info?: { start_time?: unknown; winning_team?: unknown; players?: { account_id?: unknown; team?: unknown }[] } }).match_info;
  const start = Number(info?.start_time), winner = Number(info?.winning_team);
  if (!meta?.players.length || !Number.isFinite(start) || (winner !== 0 && winner !== 1)) throw fail(422, 'The published data for this match is incomplete.');
  const teams = new Map((info?.players ?? []).map((p) => [String(p.account_id), Number(p.team)]));
  return {
    startedAt: new Date(start * 1000), durationSec: meta.durationSec, winner: winner === 0 ? 'AMBER' : 'SAPPHIRE',
    players: meta.players.map((p) => ({ ...p, team: teams.get(p.accountId) === 0 ? 'AMBER' : 'SAPPHIRE' })),
  };
}

async function refuseExisting(db: PrismaClient, matchId: string) {
  const row = await db.match.findUnique({ where: { deadlockMatchId: matchId }, select: { id: true } });
  if (row) throw fail(409, 'This match is already on the site.');
}

/** Everything a moderator needs to name the players. Writes nothing. */
export async function previewMatchImport(db: PrismaClient, api: DeadlockApi, matchId: string) {
  await refuseExisting(db, matchId);
  const m = await fetchMatch(api, matchId);
  const linked = await db.steamAccount.findMany({ where: { accountId: { in: m.players.map((p) => p.accountId) } }, include: { user: { select: { displayName: true } } } });
  const names = new Map(linked.map((s) => [s.accountId, s.user.displayName]));
  return {
    matchId, startedAt: m.startedAt, durationSec: m.durationSec, winner: m.winner,
    players: m.players.map((p) => ({ accountId: p.accountId, team: p.team, heroId: p.heroId, kills: p.kills, deaths: p.deaths, assists: p.assists, netWorth: p.netWorth, name: names.get(p.accountId) ?? null })),
  };
}

/** Stores a real, moderator-reviewed match in the active season. Players without an account get a placeholder they can claim by linking Steam. */
export async function importMatch(db: PrismaClient, api: DeadlockApi, opts: { matchId: string; names: Record<string, string>; verifiedById: string }) {
  await refuseExisting(db, opts.matchId);
  const season = await db.season.findFirst({ where: { isActive: true, isSimulated: false } });
  if (!season) throw fail(409, 'Start a real season before importing matches.');
  const m = await fetchMatch(api, opts.matchId);
  const nameOf = (p: NormalizedPlayer) => opts.names[p.accountId]?.trim();
  if (m.players.some((p) => !nameOf(p))) throw fail(400, 'Every player needs a name.');
  return db.$transaction(async (tx) => {
    const match = await tx.match.create({ data: { deadlockMatchId: opts.matchId, trackingState: 'MATCH_COMPLETED', startedAt: m.startedAt, endedAt: m.durationSec === null ? null : new Date(m.startedAt.getTime() + m.durationSec * 1000), durationSec: m.durationSec, trackingNote: 'Imported from the Deadlock API.' } });
    const result = await tx.matchResult.create({ data: { matchId: match.id, seasonId: season.id, winner: m.winner, source: 'API', verified: true, verifiedById: opts.verifiedById, rated: true, createdAt: m.startedAt } });
    for (const p of m.players) {
      const steam = await tx.steamAccount.findUnique({ where: { accountId: p.accountId } });
      const userId = steam?.userId ?? (await tx.user.create({ data: { displayName: nameOf(p)!, steam: { create: { accountId: p.accountId, steamId64: String(STEAM_ID_OFFSET + BigInt(p.accountId)) } } } })).id;
      await tx.playerStatistic.create({ data: { resultId: result.id, userId, team: p.team, won: p.team === m.winner, displayNameSnapshot: nameOf(p)!, heroId: p.heroId, kills: p.kills, deaths: p.deaths, assists: p.assists, netWorth: p.netWorth, heroDamage: p.heroDamage, details: p.details as unknown as Prisma.InputJsonValue } });
    }
    await replayTeamRatings(tx, season.id, m.startedAt);
    return { id: match.id, players: m.players.length };
  }, { timeout: 60_000 });
}

/** A match can be imported late, so later results' "ratings going in" (which set their bonus) are recalculated in play order. */
export async function replayTeamRatings(tx: Prisma.TransactionClient, seasonId: string, from: Date) {
  const results = await tx.matchResult.findMany({ where: { rated: true }, include: { stats: true }, orderBy: { createdAt: 'asc' } });
  const past = new Map<string, (typeof results)[number]['stats']>();
  const ratingOf = (userId: string | null) => skillRating(userId ? past.get(userId) ?? [] : []);
  for (const r of results) {
    if (r.seasonId === seasonId && r.createdAt >= from && r.stats.length) {
      const average = (team: Side) => { const xs = r.stats.filter((s) => s.team === team); return xs.length ? Math.round(xs.reduce((n, s) => n + ratingOf(s.userId), 0) / xs.length) : null; };
      await tx.matchResult.update({ where: { id: r.id }, data: { amberRating: average('AMBER'), sapphireRating: average('SAPPHIRE') } });
    }
    for (const s of r.stats) if (s.userId) past.set(s.userId, [...(past.get(s.userId) ?? []), s]);
  }
}
