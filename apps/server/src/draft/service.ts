import { randomInt, randomUUID } from 'node:crypto';
import { applyCommand, buildDefaultSequence, createDraftState, DraftError } from './engine.js';
import type { Actor, DraftCommand, DraftConfig, DraftState, MatchFormat, TeamSide, TimeoutBehavior, TimerSeconds } from './types.js';
import type { DraftRecord, DraftStore } from './store.js';
import type { Lock } from './lock.js';
import type { Hub } from '../realtime/hub.js';

export interface CreateDraftInput {
  name: string; pugId?: string | null; teamNames?: { amber: string; sapphire: string };
  format?: MatchFormat; bansPerTeam?: number; timerSeconds?: TimerSeconds; timeoutBehavior?: TimeoutBehavior;
  allowMirrorPicks?: boolean; firstTeam?: TeamSide; banPhases?: 1 | 2; sequence?: DraftConfig['sequence'];
  captains?: Record<TeamSide, string | null>; code?: string; visibility?: 'public' | 'private'; simulated?: boolean;
}

// No I/O/0/1 to avoid misreads when codes are read aloud on voice chat.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const generateRoomCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export type DraftEventSink = (event: 'draft.started' | 'draft.completed', rec: DraftRecord) => void;

export class DraftService {
  private timers = new Map<string, NodeJS.Timeout>();
  constructor(
    private store: DraftStore, private lock: Lock, private hub: Hub,
    private heroIds: () => number[], private sink: DraftEventSink = () => {}, private now: () => number = Date.now,
  ) {}

  async create(input: CreateDraftInput): Promise<DraftRecord> {
    const format = input.format ?? '6v6';
    const bans = input.bansPerTeam ?? 2;
    const config: DraftConfig = {
      format, bansPerTeam: bans, timerSeconds: input.timerSeconds ?? 30, timeoutBehavior: input.timeoutBehavior ?? 'random',
      allowMirrorPicks: input.allowMirrorPicks ?? false,
      sequence: input.sequence ?? buildDefaultSequence(format, bans, input.firstTeam ?? 'amber', input.banPhases ?? (format === '6v6' ? 2 : 1)),
    };
    const rec: DraftRecord = {
      id: randomUUID(), code: input.code ?? generateRoomCode(), name: input.name, pugId: input.pugId ?? null,
      teamNames: input.teamNames ?? { amber: 'Team Amber', sapphire: 'Team Sapphire' },
      visibility: input.visibility ?? 'public', simulated: input.simulated ?? false,
      state: createDraftState(config, input.captains ?? { amber: null, sapphire: null }),
    };
    await this.store.create(rec);
    this.hub.publish('dashboard', 'draft.created', { id: rec.id });
    return rec;
  }

  get(id: string) { return this.store.get(id); }

  /** What clients may see. The hovered hero stays server-side so the other team can't read intent. */
  static publicView(rec: DraftRecord): DraftRecord { return { ...rec, state: { ...rec.state, hover: null } }; }

  async execute(id: string, cmd: DraftCommand, actor: Actor | null): Promise<DraftRecord> {
    const rec = await this.lock.withLock(`draft:${id}`, async () => {
      const cur = await this.store.get(id);
      if (!cur) throw new DraftError('NOT_ACTIVE', 'Draft not found');
      const next = applyCommand(cur.state, cmd, actor, { now: this.now(), heroIds: this.heroIds() });
      await this.store.save(id, cur.state.seq, next, next.history.slice(cur.state.history.length));
      const prevStatus = cur.state.status;
      cur.state = next;
      if (prevStatus === 'waiting' && next.status === 'drafting') this.sink('draft.started', cur);
      if (next.status === 'completed' && prevStatus !== 'completed') this.sink('draft.completed', cur);
      return cur;
    });
    this.broadcast(rec);
    this.armTimer(rec);
    if (rec.state.status === 'completed' && rec.state.rematchVotes.amber && rec.state.rematchVotes.sapphire) return this.rematch(rec);
    return rec;
  }

  /** Both captains agreed: open a fresh room with the same code, settings, seats and players. The old draft stays as history. */
  private async rematch(old: DraftRecord): Promise<DraftRecord> {
    const next = await this.create({ name: old.name, pugId: old.pugId, teamNames: old.teamNames, visibility: old.visibility, simulated: old.simulated, code: old.code ?? undefined,
      format: old.state.config.format, bansPerTeam: old.state.config.bansPerTeam, timerSeconds: old.state.config.timerSeconds,
      timeoutBehavior: old.state.config.timeoutBehavior, allowMirrorPicks: old.state.config.allowMirrorPicks, sequence: old.state.config.sequence, captains: old.state.captains });
    next.state.members = structuredClone(old.state.members);
    await this.store.save(next.id, next.state.seq, next.state, []);
    this.hub.publish(`draft:${old.id}`, 'draft.redirect', { id: next.id, code: next.code });
    return next;
  }

  broadcast(rec: DraftRecord) {
    this.hub.publish(`draft:${rec.id}`, 'draft.state', DraftService.publicView(rec));
    this.hub.publish('dashboard', 'draft.updated', { id: rec.id, status: rec.state.status });
  }

  /** Re-arm timers after restart. */
  async restore() { for (const r of await this.store.listActive()) this.armTimer(r); }

  private armTimer(rec: DraftRecord) {
    const prev = this.timers.get(rec.id);
    if (prev) clearTimeout(prev);
    this.timers.delete(rec.id);
    const s: DraftState = rec.state;
    if (s.status !== 'drafting' || s.turnEndsAt === null) return;
    const seq = s.seq;
    const t = setTimeout(() => {
      this.timers.delete(rec.id);
      this.execute(rec.id, { kind: 'timeout', expectedSeq: seq }, null).catch((e: unknown) => {
        // STALE_SEQ means a captain acted just in time — expected, not an error.
        if (!(e instanceof DraftError && (e.code === 'STALE_SEQ' || e.code === 'NOT_ACTIVE'))) console.error('draft timeout failed', e);
      });
    }, Math.max(0, s.turnEndsAt - this.now()) + 50);
    t.unref?.();
    this.timers.set(rec.id, t);
  }

  shutdown() { for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); }
}
