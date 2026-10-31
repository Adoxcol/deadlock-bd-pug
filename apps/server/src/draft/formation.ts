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
}
export type FormationCommand =
  | { kind: 'join' } | { kind: 'leave' } | { kind: 'toss' }
  | { kind: 'captain'; seat: CaptainSeat }
  | { kind: 'team'; seat: CaptainSeat | null }
  | { kind: 'choice'; advantage: 'first' | 'side' }
  | { kind: 'side'; side: TeamSide }
  | { kind: 'pick'; userId: string }
  | { kind: 'skip'; agree: boolean };
export const newFormation = (): Formation => ({ seq: 0, phase: 'waiting', players: [], captains: { a: null, b: null }, teams: { a: [], b: [] }, sides: { a: 'amber', b: 'sapphire' }, winner: null, first: null, sideChooser: null, votes: [], picks: [], draftId: null });
const other = (s: CaptainSeat): CaptainSeat => s === 'a' ? 'b' : 'a';
export function pickingCaptain(s: Formation): CaptainSeat | null {
  return s.first ? (Math.floor((s.picks.length + 1) / 2) % 2 === 0 ? s.first : other(s.first)) : null;
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw Object.assign(new Error(message), { statusCode: 409 }); }

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
      s.sideChooser = other(s.first!); s.phase = 'side'; break;
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
