import type {
  Actor, DraftCommand, DraftConfig, DraftErrorCode, DraftState, DraftStep, MatchFormat, TeamSide,
} from './types.js';
export { applyFormationCommand } from './formation.js';

export class DraftError extends Error {
  constructor(public code: DraftErrorCode, message?: string) { super(message ?? code); }
}

export const TEAM_SIZE: Record<MatchFormat, number> = { '6v6': 6, '4v4': 4, '2v2': 2 };
const other = (t: TeamSide): TeamSide => (t === 'amber' ? 'sapphire' : 'amber');

/**
 * Alternating bans, then snake picks (A, B B, A A, ...). With banPhases = 2 the bans are split:
 * Bans 1 → first half of picks → Bans 2 → remaining picks (the snake continues across the split).
 */
export function buildDefaultSequence(format: MatchFormat, bansPerTeam: number, first: TeamSide = 'amber', banPhases: 1 | 2 = 1): DraftStep[] {
  const steps: DraftStep[] = [];
  const bans = (n: number) => { for (let i = 0; i < n * 2; i++) steps.push({ team: i % 2 === 0 ? first : other(first), type: 'ban' }); };
  const picks = (from: number, to: number) => {
    for (let i = from; i < to; i++) steps.push({ team: Math.floor((i + 1) / 2) % 2 === 0 ? first : other(first), type: 'pick' });
  };
  const total = TEAM_SIZE[format] * 2;
  if (banPhases === 2 && bansPerTeam >= 2) {
    const firstBans = Math.ceil(bansPerTeam / 2);
    const firstPicks = 2 * Math.ceil(TEAM_SIZE[format] / 2);
    bans(firstBans); picks(0, firstPicks); bans(bansPerTeam - firstBans); picks(firstPicks, total);
  } else { bans(bansPerTeam); picks(0, total); }
  return steps;
}

/** For "Turn 1 of 2 in a row": position of the current step within its run of same-team same-type steps. */
export function turnRun(s: DraftState): { index: number; length: number } | null {
  const seq = s.config.sequence; const cur = seq[s.step];
  if (!cur || (s.status !== 'drafting' && s.status !== 'paused')) return null;
  const same = (i: number) => seq[i]?.team === cur.team && seq[i]?.type === cur.type;
  let start = s.step; while (start > 0 && same(start - 1)) start--;
  let end = s.step; while (same(end + 1)) end++;
  return { index: s.step - start + 1, length: end - start + 1 };
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
    members: { amber: [], sapphire: [] }, ready: { amber: false, sapphire: false }, hover: null,
    rematchVotes: { amber: false, sapphire: false }, assignments: [],
  };
}

const seatOf = (s: DraftState, userId: string | undefined): TeamSide | null =>
  !userId ? null : s.captains.amber === userId ? 'amber' : s.captains.sapphire === userId ? 'sapphire' : null;

function begin(s: DraftState, now: number) {
  s.status = 'drafting'; s.startedAt = now; s.hover = null;
  s.turnEndsAt = s.config.timerSeconds ? now + s.config.timerSeconds * 1000 : null;
}

/** Fills fields added after a draft was stored (older snapshots). */
export function upgradeState(s: DraftState): DraftState {
  return {
    ...s, members: s.members ?? { amber: [], sapphire: [] }, ready: s.ready ?? { amber: false, sapphire: false },
    hover: s.hover ?? null, rematchVotes: s.rematchVotes ?? { amber: false, sapphire: false }, assignments: s.assignments ?? [],
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
  s.step += 1; s.hover = null;
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
  if (s.rosterLocked && ['claimSeat', 'leaveSeat', 'swapSides', 'joinTeam'].includes(cmd.kind)) throw new DraftError('FORBIDDEN', 'PUG teams are locked');
  const requireMod = () => { if (!actor?.isModerator) throw new DraftError('FORBIDDEN', 'Moderator only'); };

  switch (cmd.kind) {
    case 'start': {
      requireMod();
      if (s.status !== 'waiting') throw new DraftError('ALREADY_STARTED');
      if (!s.captains.amber || !s.captains.sapphire) throw new DraftError('NO_CAPTAINS', 'Both captains must be assigned');
      begin(s, now);
      break;
    }
    case 'hover': {
      // Ephemeral: does not bump seq, so it never invalidates a captain's pending lock-in.
      const st = s.config.sequence[s.step];
      if (s.status !== 'drafting' || !st || seatOf(s, actor?.userId) !== st.team) throw new DraftError('NOT_YOUR_TURN');
      if (cmd.heroId !== null && (!ctx.heroIds.includes(cmd.heroId) || !isHeroAvailable(s, cmd.heroId, st.team, st.type))) throw new DraftError('HERO_UNAVAILABLE');
      s.hover = cmd.heroId === null ? null : { team: st.team, heroId: cmd.heroId };
      return s;
    }
    case 'skip': {
      if (s.status !== 'drafting') throw new DraftError('NOT_ACTIVE');
      if (cmd.expectedSeq !== s.seq) throw new DraftError('STALE_SEQ');
      const st = s.config.sequence[s.step]!;
      if (seatOf(s, actor?.userId) !== st.team) throw new DraftError('NOT_YOUR_TURN');
      if (st.type !== 'ban') throw new DraftError('NOT_A_BAN', 'Only bans can be skipped');
      record(s, null, actor!.userId, 'manual', now);
      advance(s, now);
      break;
    }
    case 'claimSeat': {
      if (!actor) throw new DraftError('LOGIN_REQUIRED');
      if (s.status !== 'waiting') throw new DraftError('NOT_IN_LOBBY');
      const holder = s.captains[cmd.team];
      if (holder && holder !== actor.userId) throw new DraftError('SEAT_TAKEN', 'Seat is already taken');
      const prev = seatOf(s, actor.userId);
      if (prev && prev !== cmd.team) { s.captains[prev] = null; s.ready[prev] = false; }
      s.captains[cmd.team] = actor.userId; s.ready[cmd.team] = false;
      for (const t of ['amber', 'sapphire'] as const) s.members[t] = s.members[t].filter((u) => u !== actor.userId);
      break;
    }
    case 'leaveSeat': {
      if (s.status !== 'waiting') throw new DraftError('NOT_IN_LOBBY');
      const seat = seatOf(s, actor?.userId);
      if (!seat) throw new DraftError('NOT_CAPTAIN');
      s.captains[seat] = null; s.ready[seat] = false;
      break;
    }
    case 'swapSides': {
      if (s.status !== 'waiting') throw new DraftError('NOT_IN_LOBBY');
      if (!seatOf(s, actor?.userId) && !actor?.isModerator) throw new DraftError('NOT_CAPTAIN');
      s.captains = { amber: s.captains.sapphire, sapphire: s.captains.amber };
      s.members = { amber: s.members.sapphire, sapphire: s.members.amber };
      s.ready = { amber: false, sapphire: false };
      break;
    }
    case 'setReady': {
      if (s.status !== 'waiting') throw new DraftError('NOT_IN_LOBBY');
      const seat = seatOf(s, actor?.userId);
      if (!seat) throw new DraftError('NOT_CAPTAIN');
      s.ready[seat] = cmd.ready;
      if (s.ready.amber && s.ready.sapphire && s.captains.amber && s.captains.sapphire) begin(s, now);
      break;
    }
    case 'joinTeam': {
      if (!actor) throw new DraftError('LOGIN_REQUIRED');
      if (s.status === 'cancelled') throw new DraftError('NOT_ACTIVE');
      if (seatOf(s, actor.userId)) throw new DraftError('NOT_IN_LOBBY', 'Captains already belong to a team; leave the seat first');
      for (const t of ['amber', 'sapphire'] as const) s.members[t] = s.members[t].filter((u) => u !== actor.userId);
      if (cmd.team) {
        if (s.members[cmd.team].length >= TEAM_SIZE[s.config.format] - 1) throw new DraftError('SEAT_TAKEN', 'That team is full');
        s.members[cmd.team].push(actor.userId);
      }
      s.assignments = s.assignments.filter((a) => a.userId !== actor.userId);
      break;
    }
    case 'setTimeoutBehavior': {
      if (s.status !== 'waiting') throw new DraftError('NOT_IN_LOBBY');
      if (!seatOf(s, actor?.userId) && !actor?.isModerator) throw new DraftError('NOT_CAPTAIN', 'Only captains can change room settings');
      s.config.timeoutBehavior = cmd.behavior;
      break;
    }
    case 'assign': {
      if (s.status !== 'completed') throw new DraftError('NOT_COMPLETED');
      const team = (['amber', 'sapphire'] as const).find((t) => s.picks[t].includes(cmd.heroId));
      if (!team) throw new DraftError('INVALID_ASSIGNMENT', 'Hero was not picked');
      if (seatOf(s, actor?.userId) !== team && !actor?.isModerator) throw new DraftError('NOT_CAPTAIN', 'Only that team\'s captain can assign heroes');
      if (cmd.userId !== null && s.captains[team] !== cmd.userId && !s.members[team].includes(cmd.userId)) throw new DraftError('INVALID_ASSIGNMENT', 'Player is not on this team');
      // One hero per player and one player per hero.
      s.assignments = s.assignments.filter((a) => a.heroId !== cmd.heroId && a.userId !== cmd.userId);
      if (cmd.userId !== null) s.assignments.push({ team, heroId: cmd.heroId, userId: cmd.userId });
      break;
    }
    case 'voteRematch': {
      if (s.status !== 'completed') throw new DraftError('NOT_COMPLETED');
      const seat = seatOf(s, actor?.userId);
      if (!seat) throw new DraftError('NOT_CAPTAIN');
      s.rematchVotes[seat] = true;
      break;
    }
    case 'select': {
      if (s.status !== 'drafting') throw new DraftError('NOT_ACTIVE', 'Draft is not active');
      if (cmd.expectedSeq !== s.seq) throw new DraftError('STALE_SEQ', 'Draft changed; refresh and retry');
      const st = s.config.sequence[s.step]!;
      if (seatOf(s, actor?.userId) !== st.team) throw new DraftError('NOT_YOUR_TURN');
      if (!ctx.heroIds.includes(cmd.heroId)) throw new DraftError('HERO_UNKNOWN');
      if (!isHeroAvailable(s, cmd.heroId, st.team, st.type)) throw new DraftError('HERO_UNAVAILABLE');
      record(s, cmd.heroId, actor!.userId, 'manual', now);
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
        // Prefer the hero the captain was looking at, else a random available hero.
        if (s.hover && s.hover.team === st.team && isHeroAvailable(s, s.hover.heroId, st.team, st.type)) hero = s.hover.heroId;
        else {
          const pool = ctx.heroIds.filter((h) => isHeroAvailable(s, h, st.team, st.type));
          hero = pool.length ? pool[Math.floor((ctx.random ?? Math.random)() * pool.length)]! : null;
        }
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
