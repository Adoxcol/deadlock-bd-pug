import type { PrismaClient } from '@prisma/client';
import { steam64ToAccountId } from './steam.js';

export function parseSteamName(xml: string): string | null {
  return /<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/.exec(xml)?.[1]?.trim() || null;
}

export function parseSteamAvatar(xml: string): string | null {
  const url = /<avatarFull><!\[CDATA\[([\s\S]*?)\]\]><\/avatarFull>/.exec(xml)?.[1]?.trim();
  return url?.startsWith('https://') ? url : null;
}

/** Steam's public profile XML needs no API key and gives these even for private profiles. Null if unavailable. */
export async function fetchSteamProfile(id64: string): Promise<{ name: string | null; avatarUrl: string | null } | null> {
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${id64}/?xml=1`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const xml = await res.text();
    return { name: parseSteamName(xml), avatarUrl: parseSteamAvatar(xml) };
  } catch { return null; }
}

export const discordAvatarUrl = (discordId: string, hash: string | null) => (hash ? `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png?size=128` : null);

/** Steam's picture wins; Discord's is the fallback. */
export async function syncAvatar(db: PrismaClient, userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true, steam: { select: { avatarUrl: true } }, discord: { select: { discordId: true, avatar: true } } } });
  if (!u) return;
  const avatarUrl = u.steam?.avatarUrl ?? (u.discord ? discordAvatarUrl(u.discord.discordId, u.discord.avatar) : null);
  if (avatarUrl !== u.avatarUrl) await db.user.update({ where: { id: userId }, data: { avatarUrl } });
}

/** Makes the Steam name the player's name everywhere, including their past match rows. */
export async function applySteamName(db: PrismaClient, userId: string, name: string) {
  await db.$transaction([
    db.steamAccount.update({ where: { userId }, data: { personaName: name } }),
    db.user.update({ where: { id: userId }, data: { displayName: name } }),
    db.playerStatistic.updateMany({ where: { userId }, data: { displayNameSnapshot: name } }),
  ]);
}

/**
 * Links a verified Steam ID to a user. Imported players get a placeholder account with no Discord login;
 * the real owner claims its matches here. A Steam ID on a real account, or a placeholder that shares a match
 * with this user (one result can't hold two rows for them), is refused and changes nothing.
 */
export async function linkSteam(db: PrismaClient, userId: string, id64: string): Promise<{ status: 'linked'; claimed: number } | { status: 'taken' }> {
  const link = { steamId64: id64, accountId: steam64ToAccountId(id64) };
  const taken = await db.steamAccount.findUnique({ where: { steamId64: id64 } });
  const claimFrom = taken && taken.userId !== userId ? taken : null;
  if (claimFrom) {
    if (await db.discordAccount.findUnique({ where: { userId: claimFrom.userId } })) return { status: 'taken' };
    const mine = await db.playerStatistic.findMany({ where: { userId }, select: { resultId: true } });
    if (await db.playerStatistic.count({ where: { userId: claimFrom.userId, resultId: { in: mine.map((s) => s.resultId) } } })) return { status: 'taken' };
  }
  return db.$transaction(async (tx) => {
    let claimed = 0;
    if (claimFrom) {
      claimed = (await tx.playerStatistic.updateMany({ where: { userId: claimFrom.userId }, data: { userId } })).count;
      await tx.steamAccount.delete({ where: { id: claimFrom.id } });
      await tx.user.delete({ where: { id: claimFrom.userId } });
    }
    await tx.steamAccount.upsert({ where: { userId }, create: { userId, ...link }, update: link });
    return { status: 'linked' as const, claimed };
  });
}
