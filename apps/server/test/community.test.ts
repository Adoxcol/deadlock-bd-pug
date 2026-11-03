import { describe, expect, it } from 'vitest';
import { chooseCaptains, formFromSignup, newFormation } from '../src/draft/formation.js';
import { hasExpired, shouldForm, shouldRemind, signupEmbed } from '../src/discord/signups.js';
import { matchCardSvg, pickMvp, playerCardSvg, renderPng, withMeta, type CardStat } from '../src/share/card.js';
import { weekBoundary, weeklyHighlights, type WeeklyRow } from '../src/share/weekly.js';

const at = (iso: string) => new Date(iso);
const now = at('2026-11-03T12:00:00Z');
const stat = (o: Partial<CardStat>): CardStat => ({ name: 'P', team: 'AMBER', won: true, heroName: null, kills: 1, deaths: 1, assists: 1, netWorth: 1, heroDamage: 1, ...o });

describe('automatic captains', () => {
  it('takes the two highest ratings; uncalibrated players rank last', () => {
    expect(chooseCaptains([{ id: 'a', rating: null }, { id: 'b', rating: 900 }, { id: 'c', rating: 1200 }, { id: 'd', rating: 1000 }], 'rated', () => 0.5)).toEqual(['c', 'd']);
  });
  it('random mode returns two different players', () => {
    const [x, y] = chooseCaptains(['a', 'b', 'c', 'd'].map((id) => ({ id, rating: null })), 'random');
    expect(x).not.toBe(y);
  });
  it('builds a tossed room through the normal formation rules', () => {
    const players = ['a', 'b', 'c', 'd'];
    const f = formFromSignup(newFormation(), players, ['c', 'a'], 2, () => 'b');
    expect(f.phase).toBe('choice');
    expect(f.winner).toBe('b');
    expect(f.captains).toEqual({ a: 'c', b: 'a' });
    expect(f.players).toEqual(players);
  });
});

describe('sign-up timing', () => {
  const base = { status: 'OPEN', format: '2v2', createdAt: at('2026-11-03T10:00:00Z') };
  it('forms when full, but a scheduled roster waits for its start', () => {
    expect(shouldForm({ ...base, scheduledAt: null }, 4, now)).toBe(true);
    expect(shouldForm({ ...base, scheduledAt: null }, 3, now)).toBe(false);
    expect(shouldForm({ ...base, scheduledAt: at('2026-11-03T13:00:00Z') }, 4, now)).toBe(false);
    expect(shouldForm({ ...base, scheduledAt: at('2026-11-03T11:59:00Z') }, 4, now)).toBe(true);
  });
  it('reminds inside the last 30 minutes, not for a PUG created inside that window', () => {
    expect(shouldRemind({ ...base, scheduledAt: at('2026-11-03T12:20:00Z') }, now)).toBe(true);
    expect(shouldRemind({ ...base, scheduledAt: at('2026-11-03T13:00:00Z') }, now)).toBe(false);
    expect(shouldRemind({ ...base, createdAt: at('2026-11-03T11:55:00Z'), scheduledAt: at('2026-11-03T12:20:00Z') }, now)).toBe(false);
  });
  it('expires stale sign-ups', () => {
    expect(hasExpired({ ...base, scheduledAt: at('2026-11-03T09:00:00Z') }, now)).toBe(true);
    expect(hasExpired({ ...base, scheduledAt: null }, now)).toBe(false);
    expect(hasExpired({ ...base, createdAt: at('2026-11-02T10:00:00Z'), scheduledAt: null }, now)).toBe(true);
  });
  it('shows the spots left', () => {
    const e = signupEmbed({ id: 's', channelId: 'c', messageId: null, createdById: 'u', format: '2v2', captainMode: 'rated', scheduledAt: null, status: 'OPEN', pugId: null, createdAt: now, players: [{ id: 'x', signupId: 's', userId: 'u', discordId: '1', joinedAt: now }] }, 'https://x');
    expect(e.description).toContain('3 spots left');
    expect(e.fields![0].value).toContain('<@1>');
  });
});

describe('share cards', () => {
  it('MVP comes from the winning side, and is null without stats', () => {
    expect(pickMvp([stat({ name: 'loser', won: false, kills: 50 }), stat({ name: 'winner', kills: 5, deaths: 0 })])?.name).toBe('winner');
    expect(pickMvp([stat({ kills: null })])).toBeNull();
  });
  it('escapes player names and flags simulated data', () => {
    const svg = matchCardSvg({ winner: 'AMBER', amberName: '<A&B>', sapphireName: 'S', durationSec: 125, simulated: true, verified: true, stats: [stat({ name: '"x"' })] });
    expect(svg).toContain('&lt;A&amp;B&gt;');
    expect(svg).not.toContain('<A&B>');
    expect(svg).toContain('SIMULATED DATA');
    expect(svg).toContain('2:05');
  });
  it('renders a PNG', async () => {
    const png = await renderPng(playerCardSvg({ name: 'Player', rating: null, matches: 0, wins: 0, topHero: null }));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
  it('injects escaped preview tags', () => {
    const html = withMeta('<head></head>', { title: 'a"b', description: 'd', image: 'https://x/i.png', url: 'https://x' });
    expect(html).toContain('og:title" content="a&quot;b"');
    expect(html.endsWith('</head>')).toBe(true);
  });
});

describe('weekly highlights', () => {
  const row = (userId: string, won: boolean, heroId = 1): WeeklyRow => ({ userId, won, heroId, kills: won ? 10 : 1, deaths: won ? 1 : 10, assists: 5, netWorth: 20000 });
  it('uses Monday 12:00 UTC', () => {
    expect(weekBoundary(at('2026-11-03T12:00:00Z')).toISOString()).toBe('2026-11-02T12:00:00.000Z');
    expect(weekBoundary(at('2026-11-02T11:00:00Z')).toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });
  it('skips an empty week', () => expect(weeklyHighlights([], [], 0)).toBeNull());
  it('finds the top player, improver and hero; newcomers cannot be improvers', () => {
    const before = Array.from({ length: 5 }, () => row('vet', false));
    const week = [row('vet', true, 7), row('vet', true, 7), row('new', true, 2), row('new', true, 7)];
    const w = weeklyHighlights(week, before, 4)!;
    expect(w.improver?.userId).toBe('vet');
    expect(w.hero).toEqual({ heroId: 7, matches: 3 });
    expect(['vet', 'new']).toContain(w.top.userId);
  });
});
