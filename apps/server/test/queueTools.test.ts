import { describe, expect, it } from 'vitest';
import { applyBalanceVote, formFromSignup, newFormation, replacePlayer, splitTeams } from '../src/draft/formation.js';
import { relations } from '../src/rating/relations.js';

const ids = ['a', 'b', 'c', 'd'];
const tossed = () => formFromSignup(newFormation(), ids, ['a', 'b'], 2, () => 'a');

describe('replacing a player', () => {
  it('passes a captain seat and team to the newcomer', () => {
    const s = replacePlayer(tossed(), 'a', 'z');
    expect(s.captains.a).toBe('z');
    expect(s.teams.a).toEqual(['z']);
    expect(s.players).toContain('z');
    expect(s.players).not.toContain('a');
  });
  it('refuses outsiders, duplicates and open rooms', () => {
    expect(() => replacePlayer(tossed(), 'x', 'z')).toThrow('not in this room');
    expect(() => replacePlayer(tossed(), 'a', 'b')).toThrow('already');
    expect(() => replacePlayer(newFormation(), 'a', 'z')).toThrow('between the toss');
  });
});

describe('balanced teams', () => {
  it('finds the even split and keeps captains apart', () => {
    const players = [['a', 2000], ['b', 1000], ['c', 1000], ['d', 2000], ['e', 1500], ['f', 1500]].map(([id, rating]) => ({ id: id as string, rating: rating as number }));
    const t = splitTeams(players, ['a', 'd'], 3);
    expect(t.a).toContain('a');
    expect(t.b).toContain('d');
    const sum = (team: string[]) => team.reduce((n, id) => n + players.find((p) => p.id === id)!.rating, 0);
    expect(sum(t.a)).toBe(sum(t.b));
    expect([...t.a, ...t.b].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('needs both captains, then locks teams', () => {
    const split = { a: ['a', 'c'], b: ['b', 'd'] };
    const one = applyBalanceVote(tossed(), 'a', true, split);
    expect(one.phase).toBe('choice');
    const two = applyBalanceVote(one, 'b', true, split);
    expect(two.phase).toBe('complete');
    expect(two.teams).toEqual(split);
    expect(two.first).toBe('a');
    expect(() => applyBalanceVote(tossed(), 'c', true, split)).toThrow('captain');
  });
  it('a captain can change their mind', () => {
    const split = { a: ['a', 'c'], b: ['b', 'd'] };
    const back = applyBalanceVote(applyBalanceVote(tossed(), 'a', true, split), 'a', false, split);
    expect(back.votes).toEqual([]);
  });
});

describe('teammates and rivals', () => {
  const game = (id: string, meWon: boolean) => [
    { resultId: id, userId: 'me', team: 'AMBER', won: meWon }, { resultId: id, userId: 'pal', team: 'AMBER', won: meWon },
    { resultId: id, userId: 'foe', team: 'SAPPHIRE', won: !meWon }, { resultId: id, userId: null, team: 'SAPPHIRE', won: !meWon },
  ];
  it('counts from my side and needs two shared games', () => {
    const r = relations('me', [...game('1', true), ...game('2', false), { resultId: '1', userId: 'once', team: 'AMBER', won: true }]);
    expect(r.teammates).toEqual([{ userId: 'pal', games: 2, wins: 1 }]);
    expect(r.rivals).toEqual([{ userId: 'foe', games: 2, wins: 1 }]);
  });
});
