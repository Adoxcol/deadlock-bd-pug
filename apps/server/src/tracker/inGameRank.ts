import type { PrismaClient } from '@prisma/client';
import { syncAvatar } from '../auth/linkSteam.js';
import type { DeadlockApi, PlayerHeroStat, PlayerRank } from './deadlockApi.js';

/** Index is the API's rank tier; 0 means unranked. */
export const RANK_NAMES = ['Obscurus', 'Initiate', 'Seeker', 'Acolyte', 'Sentinel', 'Mystic', 'Ritualist', 'Emissary', 'Oracle', 'Phantom', 'Ascendant', 'Eternus'];
const REFRESH_AFTER_MS = 3 * 3600_000;
const INACTIVE_AFTER_MS = 30 * 24 * 3600_000;
const BATCH = 100;

/** What to store for one API row, or null when it carries no rank, so an old value is never wiped by a gap in the data. */
export function rankFields(row: PlayerRank) {
  if (!row.rank || !row.subrank) return null;
  return {
    gameRank: row.rank, gameSubrank: row.subrank,
    gameRankPoints: row.last_match?.player_rank_final_flat_progress ?? null,
    lastRankedAt: row.last_match?.start_time ? new Date(row.last_match.start_time * 1000) : null,
  };
}

interface Ranked { gameRank: number | null; gameSubrank: number | null; gameRankPoints: number | null }
/** Highest rank first, then subrank, then points. Missing points sort last. */
export function compareInGame(a: Ranked, b: Ranked) {
  return (b.gameRank ?? 0) - (a.gameRank ?? 0) || (b.gameSubrank ?? 0) - (a.gameSubrank ?? 0) || (b.gameRankPoints ?? -1) - (a.gameRankPoints ?? -1);
}

export const isInactive = (lastRankedAt: Date | null, now = new Date()) => !lastRankedAt || now.getTime() - lastRankedAt.getTime() > INACTIVE_AFTER_MS;

/** Each account's hero with the most matches. */
export function topHeroes(stats: PlayerHeroStat[]) {
  const best = new Map<string, PlayerHeroStat>();
  for (const s of stats) { const k = String(s.account_id); if (s.matches_played > (best.get(k)?.matches_played ?? 0)) best.set(k, s); }
  return new Map([...best].map(([k, s]) => [k, s.hero_id]));
}

/** Refreshes accounts not checked recently. New links have never been checked, so they are picked up on the next run. */
export async function refreshInGameRanks(db: PrismaClient, api: Pick<DeadlockApi, 'playerRanks' | 'playerProfiles' | 'playerHeroStats'>, now = new Date()) {
  const accounts = await db.steamAccount.findMany({
    where: { user: { isSimulated: false }, OR: [{ rankCheckedAt: null }, { rankCheckedAt: { lt: new Date(now.getTime() - REFRESH_AFTER_MS) } }] },
    select: { id: true, userId: true, accountId: true, avatarUrl: true },
  });
  for (let i = 0; i < accounts.length; i += BATCH) {
    const batch = accounts.slice(i, i + BATCH);
    const res = await api.playerRanks(batch.map((a) => a.accountId));
    if (!res.ok) return;
    const ids = batch.map((a) => a.accountId);
    // Pictures and heroes are extras: if either call fails, the rank still updates and the old values stay.
    const [profiles, stats] = await Promise.all([api.playerProfiles(ids), api.playerHeroStats(ids)]);
    const avatars = new Map(profiles.ok ? profiles.data.map((p) => [String(p.account_id), p.avatarfull]) : []);
    const heroes = stats.ok ? topHeroes(stats.data) : new Map<string, number>();
    const byAccount = new Map(res.data.map((r) => [String(r.account_id), r]));
    for (const a of batch) {
      const row = byAccount.get(a.accountId);
      if (!row) continue;
      const avatarUrl = avatars.get(a.accountId);
      const topHero = heroes.get(a.accountId);
      await db.steamAccount.update({ where: { id: a.id }, data: { ...rankFields(row), rankCheckedAt: now, ...(avatarUrl ? { avatarUrl } : {}), ...(topHero ? { gameTopHeroId: topHero } : {}) } });
      if (avatarUrl && avatarUrl !== a.avatarUrl) await syncAvatar(db, a.userId);
    }
  }
}
