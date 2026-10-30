import type {
  Actor, DraftCommand, DraftConfig, DraftErrorCode, DraftState, DraftStep, MatchFormat, TeamSide,
} from './types.js';

export class DraftError extends Error {
  constructor(public code: DraftErrorCode, message?: string) { super(message ?? code); }
}

export const TEAM_SIZE: Record<MatchFormat, number> = { '6v6': 6, '4v4': 4, '2v2': 2 };
const other = (t: TeamSide): TeamSide => (t === 'amber' ? 'sapphire' : 'amber');

/** Alternating bans, then snake picks (A, S S, A A, ... ). `first` team opens both phases. */
export function buildDefaultSequence(format: MatchFormat, bansPerTeam: number, first: TeamSide = 'amber'): DraftStep[] {
  const steps: DraftStep[] = [];
  for (let i = 0; i < bansPerTeam * 2; i++) steps.push({ team: i % 2 === 0 ? first : other(first), type: 'ban' });
  const total = TEAM_SIZE[format] * 2;
  for (let i = 0; i < total; i++) {
    const block = Math.floor((i + 1) / 2); // 0,1,1,2,2,3,...
    steps.push({ team: block % 2 === 0 ? first : other(first), type: 'pick' });
  }
  return steps;
}

export function validateConfig(c: DraftConfig): string[] {
  const errs: string[] = [];
  const size = TEAM_SIZE[c.format];
  for (const t of ['amber', 'sapphire'] as const) {
    const picks = c.sequence.filter((s) => s.team === t && s.type === 'pick').length;
    const bans = c.sequence.filter((s) => s.team === t && s.type === 'ban').length;
    if (picks !== size) errs.push(`${t} must have exactly ${size} picks (has ${picks})`);
    if (bans !== c.bansPerTeam) errs.push(`${t} must have exactly ${c.bansPerTeam} bans (has ${bans})`);
  }
  return errs;
}

export function createDraftState(config: DraftConfig, captains: Record<TeamSide, string | null>): DraftState {
  const errs = validateConfig(config);
  if (errs.length) throw new Error(`Invalid draft config: ${errs.join('; ')}`);
  return {
    status: 'waiting', config, captains, seq: 0, step: 0, turnEndsAt: null, pausedRemainingMs: null,
    picks: { amber: [], sapphire: [] }, bans: { amber: [], sapphire: [] }, history: [], startedAt: null, completedAt: null,
  };
}

export function currentStep(s: DraftState): DraftStep | null {
  return s.status === 'drafting' || s.status === 'paused' ? s.config.sequence[s.step] ?? null : null;
}

export function isHeroAvailable(s: DraftState, heroId: number, team: TeamSide, type: 'pick' | 'ban'): boolean {
  const banned = [...s.bans.amber, ...s.bans.sapphire];
  if (banned.includes(heroId)) return false;
  if (s.picks[team].includes(heroId)) return false;
  const pickedByOther = s.picks[other(team)].includes(heroId);
  if (type === 'ban') return !pickedByOther && !s.picks[team].includes(heroId);
  return s.config.allowMirrorPicks || !pickedByOther;
}

export function availableHeroes(s: DraftState, heroIds: number[]): number[] {
  const st = currentStep(s);
  if (!st) return [];
  return heroIds.filter((h) => isHeroAvailable(s, h, st.team, st.type));
}

function clone(s: DraftState): DraftState { return structuredClone(s); }

function advance(s: DraftState, now: number): void {
  s.step += 1;
  if (s.step >= s.config.sequence.length) {
    s.status = 'completed'; s.completedAt = now; s.turnEndsAt = null;
  } else {
    s.turnEndsAt = s.config.timerSeconds ? now + s.config.timerSeconds * 1000 : null;
  }
}

function record(s: DraftState, heroId: number | null, actorId: string | null, reason: 'manual' | 'timeout', now: number): void {
  const st = s.config.sequence[s.step]!;
  if (heroId !== null) (st.type === 'pick' ? s.picks : s.bans)[st.team].push(heroId);
  s.history.push({ seq: s.seq + 1, step: s.step, team: st.team, type: st.type, heroId, actorId, reason, at: now });
}

export interface ApplyContext { now: number; heroIds: number[]; random?: () => number }

/** Pure, server-authoritative reducer. Throws DraftError; never mutates input. */
export function applyCommand(prev: DraftState, cmd: DraftCommand, actor: Actor | null, ctx: ApplyContext): DraftState {
  const s = clone(prev);
  const { now } = ctx;
  const requireMod = () => { if (!actor?.isModerator) throw new DraftError('FORBIDDEN', 'Moderator only'); };

  switch (cmd.kind) {
    case 'start': {
      requireMod();
      if (s.status !== 'waiting') throw new DraftError('ALREADY_STARTED');
      if (!s.captains.amber || !s.captains.sapphire) throw new DraftError('NO_CAPTAINS', 'Both captains must be assigned');
      s.status = 'drafting'; s.startedAt = now;
      s.turnEndsAt = s.config.timerSeconds ? now + s.config.timerSeconds * 1000 : null;
      break;
    }
    case 'select': {
      if (s.status !== 'drafting') throw new DraftError('NOT_ACTIVE', 'Draft is not active');
      if (cmd.expectedSeq !== s.seq) throw new DraftError('STALE_SEQ', 'Draft changed; refresh and retry');
      const st = s.config.sequence[s.step]!;
      if (!actor || s.captains[st.team] !== actor.userId) throw new DraftError('NOT_YOUR_TURN');
      if (!ctx.heroIds.includes(cmd.heroId)) throw new DraftError('HERO_UNKNOWN');
      if (!isHeroAvailable(s, cmd.heroId, st.team, st.type)) throw new DraftError('HERO_UNAVAILABLE');
      record(s, cmd.heroId, actor.userId, 'manual', now);
      advance(s, now);
      break;
    }
    case 'timeout': {
      if (s.status !== 'drafting') throw new DraftError('NOT_ACTIVE');
      if (cmd.expectedSeq !== s.seq) throw new DraftError('STALE_SEQ');
      if (s.turnEndsAt === null || now < s.turnEndsAt) throw new DraftError('TIMER_NOT_EXPIRED');
      const st = s.config.sequence[s.step]!;
      const behavior = s.config.timeoutBehavior;
      if (behavior === 'pause') { s.status = 'paused'; s.pausedRemainingMs = 0; s.turnEndsAt = null; break; }
      let hero: number | null = null;
      // Bans may be skipped; picks must be filled, so 'skip' still auto-picks for picks.
      if (behavior === 'random' || st.type === 'pick') {
        const pool = ctx.heroIds.filter((h) => isHeroAvailable(s, h, st.team, st.type));
        hero = pool.length ? pool[Math.floor((ctx.random ?? Math.random)() * pool.length)]! : null;
      }
      record(s, hero, null, 'timeout', now);
      advance(s, now);
      break;
    }
    case 'pause': {
      requireMod();
      if (s.status !== 'drafting') throw new DraftError('NOT_ACTIVE');
      s.status = 'paused';
      s.pausedRemainingMs = s.turnEndsAt === null ? null : Math.max(0, s.turnEndsAt - now);
      s.turnEndsAt = null;
      break;
    }
    case 'resume': {
      requireMod();
      if (s.status !== 'paused') throw new DraftError('NOT_PAUSED');
      s.status = 'drafting';
      if (s.config.timerSeconds) {
        // A turn paused by timeout (remaining 0) gets a fresh full timer.
        const rem = s.pausedRemainingMs && s.pausedRemainingMs > 0 ? s.pausedRemainingMs : s.config.timerSeconds * 1000;
        s.turnEndsAt = now + rem;
      }
      s.pausedRemainingMs = null;
      break;
    }
    case 'cancel': {
      requireMod();
      if (s.status === 'completed' || s.status === 'cancelled') throw new DraftError('NOT_ACTIVE');
      s.status = 'cancelled'; s.turnEndsAt = null;
      break;
    }
    case 'correct': {
      requireMod();
      const entry = s.history.find((h) => h.seq === cmd.historySeq);
      if (!entry || !ctx.heroIds.includes(cmd.heroId)) throw new DraftError('INVALID_CORRECTION');
      const list = (entry.type === 'pick' ? s.picks : s.bans)[entry.team];
      const without = { ...s, picks: structuredClone(s.picks), bans: structuredClone(s.bans) };
      const wl = (entry.type === 'pick' ? without.picks : without.bans)[entry.team];
      if (entry.heroId !== null) wl.splice(wl.indexOf(entry.heroId), 1);
      if (!isHeroAvailable(without, cmd.heroId, entry.team, entry.type)) throw new DraftError('HERO_UNAVAILABLE');
      if (entry.heroId !== null) list.splice(list.indexOf(entry.heroId), 1, cmd.heroId); else list.push(cmd.heroId);
      s.history.push({ ...entry, seq: s.seq + 1, heroId: cmd.heroId, actorId: actor!.userId, reason: 'correction', at: now });
      break;
    }
  }
  s.seq += 1;
  return s;
}
