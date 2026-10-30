import type { PrismaClient } from '@prisma/client';
import type { DeadlockApi } from '../tracker/deadlockApi.js';
import { callbackUrlFor, hashSecret } from './callback.js';

export const BOT_LIFETIME_MS = 15 * 60_000; // deadlock-api: "The bot will leave the match 15 minutes after creation"
const POLL_MS = 15_000;
const GIVE_UP_MS = 60 * 60_000; // keep polling a while after the bot leaves: the match may have started late

export interface LobbyView {
  matchRowId: string; partyCode: string | null; partyId: string | null; deadlockMatchId: string | null;
  state: string; note: string | null; expiresAt: string | null; webhook: boolean;
}

export class LobbyError extends Error { constructor(message: string, public statusCode = 400) { super(message); } }

/**
 * Creates Deadlock custom lobbies via the deadlock-api bot and resolves them to Match IDs, by webhook when we are
 * publicly reachable and by polling GET /custom/{party_id}/match-id otherwise. Matching is idempotent.
 */
export class LobbyService {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  constructor(
    private db: PrismaClient, private api: DeadlockApi,
    private opts: { publicUrl: string; region: string; log: { warn(m: string): void; error(o: unknown, m?: string): void } },
    private onMatchStarted: (matchRowId: string) => Promise<void>,
    private now: () => number = Date.now,
  ) {}

  start() { this.timer = setInterval(() => void this.pollOnce(), POLL_MS); this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); }

  /** The draft's detected match if there is one (however it was linked), else its latest lobby. */
  async forDraft(draftId: string): Promise<LobbyView | null> {
    const latest = await this.db.match.findFirst({ where: { draftId, partyId: { not: null } }, orderBy: { createdAt: 'desc' } });
    const linked = await this.db.match.findFirst({ where: { draftId, deadlockMatchId: { not: null } }, orderBy: { createdAt: 'desc' } });
    if (linked && (!latest || linked.createdAt >= latest.createdAt || !latest.deadlockMatchId)) return this.view({ ...linked, partyCode: latest?.partyCode ?? linked.partyCode, lobbyExpiresAt: latest?.lobbyExpiresAt ?? linked.lobbyExpiresAt });
    return latest && this.view(latest);
  }

  view(m: { id: string; partyCode: string | null; partyId: string | null; deadlockMatchId: string | null; trackingState: string; trackingNote: string | null; lobbyExpiresAt: Date | null; callbackSecretHash: string | null }): LobbyView {
    return { matchRowId: m.id, partyCode: m.partyCode, partyId: m.partyId, deadlockMatchId: m.deadlockMatchId, state: m.trackingState, note: m.trackingNote, expiresAt: m.lobbyExpiresAt?.toISOString() ?? null, webhook: !!m.callbackSecretHash };
  }

  /** Returns the draft's open lobby if the bot is still in it; otherwise asks deadlock-api for a new one. */
  async create(input: { draftId: string; pugId: string | null; createdById: string; teamSize: number; allowDuplicateHeroes: boolean }): Promise<LobbyView> {
    const open = await this.db.match.findFirst({ where: { draftId: input.draftId, partyId: { not: null }, OR: [{ deadlockMatchId: { not: null } }, { lobbyExpiresAt: { gt: new Date(this.now()) } }] }, orderBy: { createdAt: 'desc' } });
    if (open) return this.view(open);
    // Reserve the row first so the webhook URL can carry its id.
    const row = await this.db.match.create({ data: { draftId: input.draftId, pugId: input.pugId, trackingState: 'WAITING_FOR_LOBBY', trackingNote: 'Creating lobby via the Deadlock API…', lobbyCreatedById: input.createdById } });
    const callbackUrl = callbackUrlFor(this.opts.publicUrl, row.id);
    const r = await this.api.createCustomLobby({
      callbackUrl, serverRegion: this.opts.region, minRosterSize: input.teamSize * 2,
      isPubliclyVisible: true, // live spectating is more likely to work; unverified for private lobbies
      duplicateHeroesEnabled: input.allowDuplicateHeroes,
    });
    if (!r.ok) {
      await this.db.match.delete({ where: { id: row.id } });
      throw new LobbyError(r.status === 'rate_limited' ? 'The Deadlock API lobby limit was reached (10 per hour per server without an API key). Try again later, or create the lobby in-game and use the Tracker.' : `Could not create the lobby: ${r.message}`, r.status === 'rate_limited' ? 429 : 502);
    }
    const updated = await this.db.match.update({ where: { id: row.id }, data: {
      partyId: r.data.partyId, partyCode: r.data.partyCode, callbackSecretHash: r.data.callbackSecret ? hashSecret(r.data.callbackSecret) : null,
      lobbyExpiresAt: new Date(this.now() + BOT_LIFETIME_MS), trackingState: 'LOBBY_FOUND',
      // Never put the party code in the note: notes are visible to spectators.
      trackingNote: `Lobby created. Start the match within 15 minutes. ${callbackUrl ? 'The website is notified when it starts.' : 'Match detection uses polling (no public HTTPS URL configured).'}`,
    } });
    return this.view(updated);
  }

  /** Link a Deadlock Match ID to a lobby row. Safe to call repeatedly and from both webhook and poller. */
  async attach(matchRowId: string, deadlockMatchId: string, via: 'webhook' | 'poll'): Promise<string> {
    const row = await this.db.match.findUnique({ where: { id: matchRowId } });
    if (!row) throw new LobbyError('Lobby not found', 404);
    if (row.deadlockMatchId === deadlockMatchId) return row.id;
    if (row.deadlockMatchId) throw new LobbyError('Lobby is already linked to a different match', 409);
    const existing = await this.db.match.findUnique({ where: { deadlockMatchId } });
    if (existing) {
      if (existing.draftId && existing.draftId !== row.draftId) {
        await this.db.match.update({ where: { id: row.id }, data: { trackingState: 'MANUAL_REQUIRED', trackingNote: `Match ${deadlockMatchId} is already linked to a different draft. A moderator needs to check which draft it belongs to.` } });
        throw new LobbyError('Match is already linked to a different draft', 409);
      }
      // A moderator already tracked this match by hand: link that row to this draft and retire the lobby row.
      await this.db.match.update({ where: { id: existing.id }, data: { draftId: row.draftId, pugId: existing.pugId ?? row.pugId, partyId: existing.partyId ?? row.partyId } });
      await this.db.match.update({ where: { id: row.id }, data: { trackingState: 'MATCH_DETECTED', trackingNote: `Linked to match ${deadlockMatchId}.` } });
      await this.onMatchStarted(existing.id);
      return existing.id;
    }
    await this.db.match.update({ where: { id: row.id }, data: { deadlockMatchId, trackingState: 'MATCH_DETECTED', startedAt: row.startedAt ?? new Date(this.now()), trackingNote: `Match ${deadlockMatchId} detected via ${via === 'webhook' ? 'Deadlock API callback' : 'polling'}.` } });
    await this.onMatchStarted(row.id);
    return row.id;
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const since = new Date(this.now() - GIVE_UP_MS);
      const waiting = await this.db.match.findMany({ where: { partyId: { not: null }, deadlockMatchId: null, trackingState: { in: ['LOBBY_FOUND', 'WAITING_FOR_MATCH'] }, createdAt: { gt: since } }, take: 20 });
      for (const m of waiting) {
        const r = await this.api.partyMatchId(m.partyId!);
        if (r.ok) { await this.attach(m.id, r.data.matchId, 'poll').catch((e) => this.opts.log.error(e, 'lobby attach failed')); continue; }
        if (r.status === 'rate_limited') { this.opts.log.warn('deadlock-api rate limited lobby polling'); break; }
        if (m.lobbyExpiresAt && m.lobbyExpiresAt.getTime() < this.now() && m.trackingState === 'LOBBY_FOUND') {
          await this.db.match.update({ where: { id: m.id }, data: { trackingState: 'WAITING_FOR_MATCH', trackingNote: 'The Deadlock API bot has left the lobby (15-minute limit). If the match started, it will still be detected for up to an hour; otherwise enter the Match ID in the Tracker or create a new lobby.' } });
        }
      }
      const stale = await this.db.match.updateMany({ where: { partyId: { not: null }, deadlockMatchId: null, trackingState: { in: ['LOBBY_FOUND', 'WAITING_FOR_MATCH'] }, createdAt: { lte: since } }, data: { trackingState: 'MANUAL_REQUIRED', trackingNote: 'No match was detected for this lobby. Enter the Match ID in the Tracker if the game was played.' } });
      void stale;
    } catch (e) { this.opts.log.error(e, 'lobby poll failed'); }
    finally { this.polling = false; }
  }
}
