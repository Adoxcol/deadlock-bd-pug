export type TeamSide = 'amber' | 'sapphire';
export type DraftActionType = 'pick' | 'ban';
export type DraftStatus = 'waiting' | 'drafting' | 'paused' | 'completed' | 'cancelled';
export type TimeoutBehavior = 'random' | 'skip' | 'pause';
export type MatchFormat = '6v6' | '4v4' | '2v2';
export const TIMER_OPTIONS = [0, 30, 45, 60, 90] as const;
export type TimerSeconds = (typeof TIMER_OPTIONS)[number];

export interface DraftStep { team: TeamSide; type: DraftActionType }

export interface DraftConfig {
  format: MatchFormat;
  bansPerTeam: number;
  timerSeconds: TimerSeconds;
  timeoutBehavior: TimeoutBehavior;
  /** Whether both teams may pick the same hero. Same team can never pick a hero twice. */
  allowMirrorPicks: boolean;
  sequence: DraftStep[];
}

export interface DraftHistoryEntry {
  seq: number;
  step: number;
  team: TeamSide;
  type: DraftActionType;
  heroId: number | null; // null = skipped
  actorId: string | null; // null = system (timeout)
  reason: 'manual' | 'timeout' | 'correction';
  at: number;
}

export interface DraftState {
  status: DraftStatus;
  config: DraftConfig;
  captains: Record<TeamSide, string | null>;
  /** Number of accepted mutations; clients send it back as expectedSeq. */
  seq: number;
  step: number;
  turnEndsAt: number | null;
  pausedRemainingMs: number | null;
  picks: Record<TeamSide, number[]>;
  bans: Record<TeamSide, number[]>;
  history: DraftHistoryEntry[];
  startedAt: number | null;
  completedAt: number | null;
}

export type DraftCommand =
  | { kind: 'start' }
  | { kind: 'select'; heroId: number; expectedSeq: number }
  | { kind: 'timeout'; expectedSeq: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'cancel' }
  | { kind: 'correct'; historySeq: number; heroId: number };

export interface Actor { userId: string; isModerator: boolean }

export type DraftErrorCode =
  | 'NOT_ACTIVE' | 'NOT_YOUR_TURN' | 'FORBIDDEN' | 'STALE_SEQ' | 'HERO_UNKNOWN'
  | 'HERO_UNAVAILABLE' | 'ALREADY_STARTED' | 'NOT_PAUSED' | 'INVALID_CORRECTION' | 'TIMER_NOT_EXPIRED' | 'NO_CAPTAINS';
