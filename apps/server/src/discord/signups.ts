import type { PrismaClient, PugSignup, PugSignupPlayer } from '@prisma/client';
import { TEAM_SIZE } from '../draft/engine.js';
import type { CaptainMode } from '../draft/formation.js';
import { COLORS, type Embed, type Notifier } from './notifier.js';

export type SignupWithPlayers = PugSignup & { players: PugSignupPlayer[] };
export interface FormedPug { id: string; number: number; captains: [string, string] }
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
export const signupTotal = (format: string) => TEAM_SIZE[format as keyof typeof TEAM_SIZE] * 2;
const stamp = (d: Date, style: 'f' | 'R') => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;
const mention = (id: string) => `<@${id}>`;
const REMINDER_MS = 30 * 60_000;
const UNSCHEDULED_TTL_MS = 24 * 3600_000;
const SCHEDULED_GRACE_MS = 2 * 3600_000;

/** A scheduled sign-up holds its full roster until start time, so a late leaver costs a slot rather than a formed room. */
export const shouldForm = (s: Pick<PugSignup, 'status' | 'format' | 'scheduledAt'>, count: number, now: Date) =>
  s.status === 'OPEN' && count >= signupTotal(s.format) && (!s.scheduledAt || s.scheduledAt <= now);
export const shouldRemind = (s: Pick<PugSignup, 'status' | 'scheduledAt' | 'createdAt'>, now: Date) =>
  s.status === 'OPEN' && !!s.scheduledAt && s.scheduledAt > now && s.scheduledAt.getTime() - now.getTime() <= REMINDER_MS && s.scheduledAt.getTime() - s.createdAt.getTime() > REMINDER_MS;
export const hasExpired = (s: Pick<PugSignup, 'status' | 'scheduledAt' | 'createdAt'>, now: Date) =>
  s.status === 'OPEN' && (s.scheduledAt ? now.getTime() - s.scheduledAt.getTime() > SCHEDULED_GRACE_MS : now.getTime() - s.createdAt.getTime() > UNSCHEDULED_TTL_MS);

export function signupEmbed(s: SignupWithPlayers, publicUrl: string): Embed {
  const total = signupTotal(s.format);
  const roster = s.players.map((p, n) => `${n + 1}. ${mention(p.discordId)}`).join('\n') || 'Nobody yet.';
  const status = s.status === 'FILLED' ? 'Full. Teams are forming.' : s.status === 'CANCELLED' ? 'Closed.' : `${total - s.players.length} spot${total - s.players.length === 1 ? '' : 's'} left`;
  return {
    title: `PUG sign-up · ${s.format}`, color: s.status === 'OPEN' ? COLORS.teal : COLORS.purple,
    description: [s.scheduledAt ? `Starts ${stamp(s.scheduledAt, 'f')} (${stamp(s.scheduledAt, 'R')})` : 'Starts as soon as it fills.', `Captains: ${s.captainMode === 'random' ? 'random' : 'two highest rated'}`, `**${status}**`].join('\n'),
    fields: [{ name: `Players ${s.players.length}/${total}`, value: roster }],
    ...(s.pugId ? { url: `${publicUrl}/pugs/${s.pugId}` } : {}),
  };
}

export class SignupService {
  constructor(private db: PrismaClient, private notifier: Notifier, private publicUrl: string,
    private form: (hostId: string, format: string, userIds: string[], mode: CaptainMode) => Promise<FormedPug>,
    private editMessage: (channelId: string, messageId: string, embed: Embed) => Promise<void>,
    private log: (e: unknown) => void) {}

  private load = (id: string) => this.db.pugSignup.findUniqueOrThrow({ where: { id }, include: { players: { orderBy: { joinedAt: 'asc' } } } });

  async start(input: { channelId: string; hostId: string; hostDiscordId: string; format: string; scheduledAt: Date | null; captainMode: CaptainMode }) {
    const { hostDiscordId, hostId, ...data } = input;
    return this.db.pugSignup.create({ data: { ...data, createdById: hostId, players: { create: { userId: input.hostId, discordId: hostDiscordId } } }, include: { players: true } });
  }
  async attachMessage(id: string, messageId: string) { await this.db.pugSignup.update({ where: { id }, data: { messageId } }); }

  async join(id: string, userId: string, discordId: string) {
    const count = await this.db.$transaction(async (tx) => {
      // The row lock stops two simultaneous clicks from overfilling the last slot.
      await tx.$queryRaw`SELECT id FROM "PugSignup" WHERE id = ${id} FOR UPDATE`;
      const s = await tx.pugSignup.findUniqueOrThrow({ where: { id }, include: { players: true } });
      if (s.status !== 'OPEN') throw fail('This sign-up is closed.');
      if (s.players.some((p) => p.userId === userId)) throw fail('You already joined.');
      if (s.players.length >= signupTotal(s.format)) throw fail('This sign-up is full.');
      await tx.pugSignupPlayer.create({ data: { signupId: id, userId, discordId } });
      return s.players.length + 1;
    });
    const s = await this.load(id);
    if (count === signupTotal(s.format) - 1) await this.notifier.enqueue('signup', `signup.one-left:${id}`, { title: '1 spot left', description: `The ${s.format} PUG needs one more player.`, color: COLORS.amber, content: '@here 1 spot left in the PUG sign-up above.' }, false, { channelId: s.channelId });
    return this.tryForm(id, new Date());
  }

  async leave(id: string, userId: string) {
    const s = await this.load(id);
    if (s.status !== 'OPEN') throw fail('This sign-up is closed.');
    const { count } = await this.db.pugSignupPlayer.deleteMany({ where: { signupId: id, userId } });
    if (!count) throw fail('You have not joined.');
    return this.load(id);
  }

  async cancel(id: string, actor: { id: string; isMod: boolean }) {
    const s = await this.load(id);
    if (s.createdById !== actor.id && !actor.isMod) throw fail('Only the host or a moderator can close this.', 403);
    const { count } = await this.db.pugSignup.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'CANCELLED' } });
    if (!count) throw fail('This sign-up is closed.');
    return this.load(id);
  }

  /** The status swap is the claim: only one caller can move a sign-up out of OPEN, so a roster forms one room. */
  async tryForm(id: string, now: Date): Promise<SignupWithPlayers> {
    const s = await this.load(id);
    if (!shouldForm(s, s.players.length, now)) return s;
    const { count } = await this.db.pugSignup.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'FILLED' } });
    if (!count) return this.load(id);
    let pug: FormedPug;
    try { pug = await this.form(s.createdById, s.format, s.players.map((p) => p.userId), s.captainMode as CaptainMode); }
    catch (e) { await this.db.pugSignup.update({ where: { id }, data: { status: 'OPEN' } }); throw e; }
    await this.db.pugSignup.update({ where: { id }, data: { pugId: pug.id } });
    const url = `${this.publicUrl}/pugs/${pug.id}`;
    const byUser = new Map(s.players.map((p) => [p.userId, p.discordId]));
    const captains = pug.captains.map((c) => mention(byUser.get(c)!)).join(' and ');
    await this.notifier.enqueue('signup', `signup.filled:${id}`, { title: `PUG #${pug.number} is ready`, description: `Captains: ${captains}. The toss is done. Open the room to pick teams.`, url, color: COLORS.teal, content: s.players.map((p) => mention(p.discordId)).join(' ') }, false, { channelId: s.channelId });
    for (const c of pug.captains) await this.notifier.enqueue('signup', `signup.captain:${id}:${c}`, { title: `You are a captain in PUG #${pug.number}`, description: `Open the room to pick your team: ${url}`, url, color: COLORS.teal }, false, { discordId: byUser.get(c)! });
    return this.load(id);
  }

  private async refresh(s: SignupWithPlayers) {
    if (!s.messageId) return;
    await this.editMessage(s.channelId, s.messageId, signupEmbed(s, this.publicUrl)).catch(this.log);
  }

  /** Reminders, scheduled starts and expiry. Dedupe keys make repeated ticks harmless. */
  async tick(now = new Date()) {
    const open = await this.db.pugSignup.findMany({ where: { status: 'OPEN' }, include: { players: { orderBy: { joinedAt: 'asc' } } } });
    for (const s of open) {
      try {
        if (shouldRemind(s, now)) await this.notifier.enqueue('signup', `signup.reminder:${s.id}`, { title: 'PUG starts in 30 minutes', description: `${s.players.length}/${signupTotal(s.format)} signed up. Starts ${stamp(s.scheduledAt!, 'R')}.`, color: COLORS.amber, content: s.players.map((p) => mention(p.discordId)).join(' ') }, false, { channelId: s.channelId });
        if (hasExpired(s, now)) {
          await this.db.pugSignup.updateMany({ where: { id: s.id, status: 'OPEN' }, data: { status: 'CANCELLED' } });
          await this.refresh(await this.load(s.id));
          continue;
        }
        const after = await this.tryForm(s.id, now);
        if (after.status !== s.status) await this.refresh(after);
      } catch (e) { this.log(e); }
    }
  }

  nextOpen() {
    return this.db.pugSignup.findMany({ where: { status: 'OPEN' }, orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], take: 3, include: { _count: { select: { players: true } } } });
  }
}
