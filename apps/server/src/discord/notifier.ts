import type { PrismaClient, Prisma } from '@prisma/client';

export interface Embed { title: string; description?: string; url?: string; color?: number; fields?: Array<{ name: string; value: string; inline?: boolean }>; footer?: { text: string }; image?: { url: string }; /** Text outside the embed: only this can ping. */ content?: string }
export type Target = { channelId: string } | { discordId: string };
export type NotificationKind = 'pug.created' | 'draft.started' | 'draft.completed' | 'match.started' | 'match.completed' | 'match.result' | 'rating.changed' | 'signup' | 'lobby.code' | 'weekly.highlights';
export interface Sender { send(channelId: string, embed: Embed): Promise<string>; dm(discordId: string, embed: Embed): Promise<string>; /** Rewrites a message and removes its buttons. */ edit(channelId: string, messageId: string, embed: Embed): Promise<void> }

export const COLORS = { teal: 0x2dd4bf, purple: 0xa78bfa, amber: 0xf59e0b, red: 0xef4444 };

/**
 * Outbox: every notification is written once (unique dedupeKey), then delivered by a worker.
 * Re-processing the same event never double-posts.
 */
export class Notifier {
  constructor(private db: PrismaClient, private sender: Sender | null, private channelFor: (k: NotificationKind) => Promise<string | null>) {}

  async enqueue(kind: NotificationKind, dedupeKey: string, embed: Embed, simulated = false, target?: Target) {
    if (simulated) embed = { ...embed, footer: { text: 'SIMULATED DATA — not a real match' } };
    await this.db.discordNotification.upsert({ where: { dedupeKey }, create: { dedupeKey, kind, payload: { ...embed, ...(target ? { target } : {}) } as unknown as Prisma.InputJsonValue }, update: {} });
  }

  async flush(limit = 10) {
    const pending = await this.db.discordNotification.findMany({ where: { status: 'pending', attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, take: limit });
    for (const n of pending) {
      const { target, ...embed } = n.payload as unknown as Embed & { target?: Target };
      const channelId = target ? ('channelId' in target ? target.channelId : null) : await this.channelFor(n.kind as NotificationKind);
      const dmTo = target && 'discordId' in target ? target.discordId : null;
      if (!this.sender || (!channelId && !dmTo)) { await this.db.discordNotification.update({ where: { id: n.id }, data: { status: 'skipped', error: 'Discord not configured' } }); continue; }
      try {
        const messageId = dmTo ? await this.sender.dm(dmTo, embed) : await this.sender.send(channelId!, embed);
        await this.db.discordNotification.update({ where: { id: n.id }, data: { status: 'sent', messageId, channelId, sentAt: new Date(), attempts: { increment: 1 } } });
      } catch (e) {
        await this.db.discordNotification.update({ where: { id: n.id }, data: { attempts: { increment: 1 }, error: String(e), status: n.attempts + 1 >= 5 ? 'failed' : 'pending' } });
      }
    }
  }
}
