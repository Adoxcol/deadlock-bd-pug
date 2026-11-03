import type { TeamSide } from './types.js';

export type CaptainSeat = 'a' | 'b';
export interface Formation {
  seq: number;
  phase: 'waiting' | 'choice' | 'side' | 'picking' | 'complete';
  players: string[];
  captains: Record<CaptainSeat, string | null>;
  teams: Record<CaptainSeat, string[]>;
  sides: Record<CaptainSeat, TeamSide>;
  winner: CaptainSeat | null;
  first: CaptainSeat | null;
  sideChooser: CaptainSeat | null;
  votes: CaptainSeat[];
  picks: { captain: CaptainSeat; userId: string }[];
  draftId: string | null;
  /** Names captains typed. A missing entry means the default, "<captain>'s Team". */
  teamNames?: Partial<Record<CaptainSeat, string>>;
}
export type FormationCommand =
  | { kind: 'join' } | { kind: 'leave' } | { kind: 'toss' }
  | { kind: 'captain'; seat: CaptainSeat }
  | { kind: 'team'; seat: CaptainSeat | null }
  | { kind: 'choice'; advantage: 'first' | 'side'; side?: TeamSide }
  | { kind: 'teamName'; name: string }
  | { kind: 'side'; side: TeamSide }
  | { kind: 'pick'; userId: string }
  | { kind: 'skip'; agree: boolean };
export const defaultTeamName = (captain: string) => `${captain.replace('[SIM] ', '')}'s Team`.slice(0, 32);
export const newFormation = (): Formation => ({ seq: 0, phase: 'waiting', players: [], captains: { a: null, b: null }, teams: { a: [], b: [] }, sides: { a: 'amber', b: 'sapphire' }, winner: null, first: null, sideChooser: null, votes: [], picks: [], draftId: null });
const other = (s: CaptainSeat): CaptainSeat => s === 'a' ? 'b' : 'a';
export function pickingCaptain(s: Formation): CaptainSeat | null {
  return s.first ? (Math.floor((s.picks.length + 1) / 2) % 2 === 0 ? s.first : other(s.first)) : null;
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw Object.assign(new Error(message), { statusCode: 409 }); }

export type CaptainMode = 'rated' | 'random';

/** Shuffled first, so ties and uncalibrated players are not decided by who clicked Join first. */
export function chooseCaptains(players: { id: string; rating: number | null }[], mode: CaptainMode, random = Math.random): [string, string] {
  const pool = [...players];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  if (mode === 'rated') pool.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  return [pool[0]!.id, pool[1]!.id];
}

/** Seats a full sign-up and tosses, using the same commands a room runs by hand. */
export function formFromSignup(prev: Formation, players: string[], captains: [string, string], size: number, toss: () => CaptainSeat): Formation {
  const run = (s: Formation, cmd: FormationCommand, userId: string) => applyFormationCommand(s, cmd, userId, size, s.seq, toss);
  let s = players.reduce((f, id) => run(f, { kind: 'join' }, id), prev);
  s = run(s, { kind: 'captain', seat: 'a' }, captains[0]);
  s = run(s, { kind: 'captain', seat: 'b' }, captains[1]);
  return run(s, { kind: 'toss' }, captains[0]);
}

export type InviteRole = 'captainA' | 'captainB' | 'player';

/** Applies an invite link. Reopening a link you already used changes nothing and returns the same object. */
export function applyInvite(prev: Formation, role: InviteRole, userId: string, size: number): Formation {
  const seat = role === 'captainA' ? 'a' : role === 'captainB' ? 'b' : null;
  if (seat ? prev.captains[seat] === userId : prev.players.includes(userId)) return prev;
  const never = (): CaptainSeat => 'a';
  // Two pool slots stay reserved so the player link can't lock the captains out.
  if (!seat) check(prev.players.filter((id) => id !== prev.captains.a && id !== prev.captains.b).length < size * 2 - 2, 'The player pool is full.');
  let next = prev.players.includes(userId) ? prev : applyFormationCommand(prev, { kind: 'join' }, userId, size, prev.seq, never);
  if (seat) next = applyFormationCommand(next, { kind: 'captain', seat }, userId, size, next.seq, never);
  return next;
}

/** Randomness is supplied by the server; the result is committed with the action, never rerolled on reads. */
export function applyFormationCommand(prev: Formation, cmd: FormationCommand, userId: string, size: number, expectedSeq: number, toss: () => CaptainSeat): Formation {
  check(expectedSeq === prev.seq, 'Room changed. Refresh and try again.');
  check(prev.phase !== 'complete', 'Teams are locked for the hero draft.');
  const s = structuredClone(prev);
  const seat = (['a', 'b'] as const).find((t) => s.captains[t] === userId);
  const full = () => s.players.length === size * 2 && s.captains.a && s.captains.b;
  const removeFromTeams = () => { for (const t of ['a', 'b'] as const) s.teams[t] = s.teams[t].filter((id) => id !== userId); };
  if (['join', 'leave', 'captain', 'team'].includes(cmd.kind)) {
    check(s.phase === 'waiting', 'The player pool is locked after the toss.');
    s.votes = [];
  }
  switch (cmd.kind) {
    case 'join':
      check(!s.players.includes(userId), 'You already joined.');
      check(s.players.length < size * 2, 'The player pool is full.');
      s.players.push(userId); break;
    case 'leave':
      check(s.players.includes(userId), 'Join the room first.');
      s.players = s.players.filter((id) => id !== userId); removeFromTeams();
      if (seat) s.captains[seat] = null;
      break;
    case 'captain':
      check(s.players.includes(userId), 'Join the room first.');
      check(!s.captains[cmd.seat], 'That captain seat is occupied.');
      check(!seat, 'Leave the room before changing captain seats.');
      check(s.teams[cmd.seat].filter((id) => id !== userId).length < size, 'That team is full.');
      removeFromTeams(); s.captains[cmd.seat] = userId; s.teams[cmd.seat].push(userId); break;
    case 'team':
      check(s.players.includes(userId) && !seat, 'Only joined non-captains can choose a team.');
      removeFromTeams();
      if (cmd.seat) { check(s.teams[cmd.seat].length < size - (s.captains[cmd.seat] ? 0 : 1), 'That team is full (one slot is reserved for its captain).'); s.teams[cmd.seat].push(userId); }
      break;
    case 'toss':
      check(s.phase === 'waiting' && seat && full(), 'Two captains and a full player pool are required.');
      s.winner = toss(); s.phase = 'choice'; s.votes = [];
      s.teams = { a: [s.captains.a!], b: [s.captains.b!] }; break;
    case 'choice':
      check(s.phase === 'choice' && seat === s.winner, 'Only the toss winner can choose.');
      s.first = cmd.advantage === 'first' ? s.winner : other(s.winner!);
      s.sideChooser = other(s.first!); s.phase = 'side';
      // A winner who takes a side names it in one step, so there is nothing left to wait for.
      if (cmd.advantage === 'side' && cmd.side) { s.sides[seat!] = cmd.side; s.sides[other(seat!)] = cmd.side === 'amber' ? 'sapphire' : 'amber'; s.phase = 'picking'; }
      break;
    case 'teamName':
      check(seat, 'Only a captain can name their team.');
      s.teamNames = { ...s.teamNames };
      if (cmd.name) s.teamNames[seat] = cmd.name; else delete s.teamNames[seat];
      break;
    case 'side':
      check(s.phase === 'side' && seat === s.sideChooser, 'The other captain has side choice.');
      s.sides[seat!] = cmd.side; s.sides[other(seat!)] = cmd.side === 'amber' ? 'sapphire' : 'amber';
      s.phase = 'picking'; break;
    case 'pick':
      check(s.phase === 'picking' && seat && seat === pickingCaptain(s), 'It is not your player pick.');
      check(s.players.includes(cmd.userId) && ![...s.teams.a, ...s.teams.b].includes(cmd.userId), 'Player is not available.');
      check(s.teams[seat].length < size, 'That team is full.');
      s.teams[seat].push(cmd.userId); s.picks.push({ captain: seat, userId: cmd.userId });
      if (s.teams.a.length === size && s.teams.b.length === size) s.phase = 'complete';
      break;
    case 'skip':
      check(s.phase === 'waiting' && seat && full() && s.teams.a.length === size && s.teams.b.length === size, 'Skipping requires two captains and two full prearranged teams.');
      s.votes = s.votes.filter((t) => t !== seat);
      if (cmd.agree) s.votes.push(seat);
      if (s.votes.length === 2) s.phase = 'complete';
      break;
  }
  s.seq++;
  return s;
}
