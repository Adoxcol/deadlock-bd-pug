import { describe, expect, it } from 'vitest';
import { matchPoints, skillRating, standings, underdogBonus } from '../src/rating/points.js';

describe('PUG points', () => {
  it('matches the published scores', () => {
    expect(matchPoints({ won: true, kills: 22, deaths: 5, assists: 15, netWorth: 71700 })).toBe(120);
    expect(matchPoints({ won: true, kills: 16, deaths: 8, assists: 15, netWorth: 40300 })).toBe(89);
    expect(matchPoints({ won: true, kills: 4, deaths: 7, assists: 19, netWorth: 39000 })).toBe(70);
    expect(matchPoints({ won: false, kills: 13, deaths: 4, assists: 11, netWorth: 41400 })).toBe(64);
    expect(matchPoints({ won: false, kills: 8, deaths: 10, assists: 9, netWorth: 32400 })).toBe(41);
  });
  it('never goes below zero and treats missing stats as zero', () => {
    expect(matchPoints({ won: false, kills: 0, deaths: 40, assists: 0, netWorth: 0 })).toBe(0);
    expect(matchPoints({ won: true, kills: null, deaths: null, assists: null, netWorth: null })).toBe(30);
  });
  it('rates players from play and starts new players at 1200', () => {
    expect(skillRating([])).toBe(1200);
    const big = { won: true, kills: 19, deaths: 4, assists: 9, netWorth: 46546 };
    expect(skillRating([big])).toBe(1344);
    expect(skillRating([{ ...big, bonus: 20 }])).toBe(1344);
    expect(skillRating(Array(5).fill(big))).toBe(1920);
    expect(skillRating(Array(9).fill(big))).toBe(1920);
  });
  it('pays only the underdog, capped, half on a loss', () => {
    expect(underdogBonus('AMBER', true, 1100, 1250)).toBe(15);
    expect(underdogBonus('AMBER', false, 1100, 1250)).toBe(8);
    expect(underdogBonus('SAPPHIRE', true, 1100, 1250)).toBe(0);
    expect(underdogBonus('SAPPHIRE', true, 1900, 1100)).toBe(20);
    expect(underdogBonus('AMBER', true, null, null)).toBe(0);
    expect(matchPoints({ won: false, kills: 0, deaths: 40, assists: 0, netWorth: 0, bonus: 8 })).toBe(8);
  });
  it('totals per player, ranks by points and skips guests', () => {
    const none = { kills: 0, deaths: 0, assists: 0, netWorth: 0 };
    const out = standings([{ userId: 'a', won: true, ...none }, { userId: 'a', won: false, ...none }, { userId: 'b', won: true, ...none, kills: 10 }, { userId: null, won: true, ...none }]);
    expect(out).toEqual([{ userId: 'b', points: 50, matches: 1, wins: 1, losses: 0 }, { userId: 'a', points: 40, matches: 2, wins: 1, losses: 1 }]);
  });
});
