/** Share images and link-preview tags. 1200x630 is the size Facebook and Discord show at full width. */
const W = 1200, H = 630;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const text = (x: number, y: number, size: number, fill: string, value: string, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
const INK = '#f4efe3', MUTED = '#9c978a', AMBER = '#f59e0b', SAPPHIRE = '#60a5fa', BRASS = '#c9a35b';

function frame(body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, Segoe UI, Arial, sans-serif"><rect width="${W}" height="${H}" fill="#14130f"/><rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${BRASS}" stroke-width="2"/>${text(64, 84, 22, BRASS, 'DEADLOCK PUGS · BANGLADESH', 'font-weight="700" letter-spacing="3"')}${body}</svg>`;
}

export interface CardStat { name: string; team: 'AMBER' | 'SAPPHIRE'; won: boolean; heroName: string | null; kills: number | null; deaths: number | null; assists: number | null; netWorth: number | null; heroDamage: number | null }
export interface MatchCard { winner: 'AMBER' | 'SAPPHIRE'; amberName: string; sapphireName: string; durationSec: number | null; simulated: boolean; verified: boolean; stats: CardStat[] }

/** Winning side only: best KDA, then damage. Null when no player stats were published. */
export function pickMvp(stats: CardStat[]): CardStat | null {
  const kda = (s: CardStat) => ((s.kills ?? 0) + (s.assists ?? 0)) / Math.max(1, s.deaths ?? 0);
  return stats.filter((s) => s.won && s.kills !== null).sort((a, b) => kda(b) - kda(a) || (b.heroDamage ?? 0) - (a.heroDamage ?? 0))[0] ?? null;
}
const leader = (stats: CardStat[], key: 'kills' | 'heroDamage' | 'netWorth') => stats.filter((s) => s[key] !== null).sort((a, b) => b[key]! - a[key]!)[0] ?? null;
const teamKills = (stats: CardStat[], team: CardStat['team']) => stats.filter((s) => s.team === team).reduce((n, s) => n + (s.kills ?? 0), 0);

export function matchCardSvg(m: MatchCard): string {
  const winnerName = m.winner === 'AMBER' ? m.amberName : m.sapphireName;
  const hasStats = m.stats.some((s) => s.kills !== null);
  const parts = [
    text(64, 170, 60, m.winner === 'AMBER' ? AMBER : SAPPHIRE, cut(winnerName, 26), 'font-weight="700"'),
    text(64, 218, 28, INK, `won${m.durationSec ? ` in ${Math.floor(m.durationSec / 60)}:${String(m.durationSec % 60).padStart(2, '0')}` : ''}`),
    text(64, 290, 30, AMBER, `${cut(m.amberName, 22)}${hasStats ? `  ${teamKills(m.stats, 'AMBER')}` : ''}`, 'font-weight="700"'),
    text(64, 334, 30, SAPPHIRE, `${cut(m.sapphireName, 22)}${hasStats ? `  ${teamKills(m.stats, 'SAPPHIRE')}` : ''}`, 'font-weight="700"'),
  ];
  const mvp = pickMvp(m.stats);
  if (mvp) parts.push(text(64, 420, 20, BRASS, 'MVP', 'font-weight="700" letter-spacing="3"'), text(64, 466, 40, INK, cut(mvp.name, 26), 'font-weight="700"'), text(64, 506, 24, MUTED, `${mvp.heroName ? `${cut(mvp.heroName, 18)} · ` : ''}${mvp.kills}/${mvp.deaths ?? 0}/${mvp.assists ?? 0}`));
  const rows: Array<[string, CardStat | null, (s: CardStat) => string]> = [
    ['MOST KILLS', leader(m.stats, 'kills'), (s) => String(s.kills)],
    ['MOST HERO DAMAGE', leader(m.stats, 'heroDamage'), (s) => s.heroDamage!.toLocaleString('en-US')],
    ['HIGHEST NET WORTH', leader(m.stats, 'netWorth'), (s) => s.netWorth!.toLocaleString('en-US')],
  ];
  rows.forEach(([label, s, value], n) => {
    if (!s) return;
    const y = 170 + n * 125;
    parts.push(text(720, y, 18, BRASS, label, 'font-weight="700" letter-spacing="2"'), text(720, y + 42, 32, INK, value(s), 'font-weight="700"'), text(720, y + 76, 22, MUTED, cut(s.name, 28)));
  });
  const flags = [m.simulated ? 'SIMULATED DATA' : null, m.verified ? null : 'UNVERIFIED'].filter(Boolean).join(' · ');
  if (flags) parts.push(text(64, 570, 20, AMBER, flags, 'font-weight="700"'));
  return frame(parts.join(''));
}

export function playerCardSvg(p: { name: string; rating: number | null; matches: number; wins: number; topHero: string | null }): string {
  const cell = (x: number, label: string, value: string) => text(x, 400, 20, BRASS, label, 'font-weight="700" letter-spacing="2"') + text(x, 456, 44, INK, value, 'font-weight="700"');
  const winRate = p.matches ? `${Math.round((p.wins / p.matches) * 100)}%` : '–';
  return frame(text(64, 240, 76, INK, cut(p.name, 22), 'font-weight="700"') + cell(64, 'RATING', p.rating === null ? 'Calibrating' : String(p.rating)) + cell(420, 'MATCHES', String(p.matches)) + cell(640, 'WIN RATE', winRate) + (p.topHero ? cell(860, 'TOP HERO', cut(p.topHero, 12)) : ''));
}

export const siteCardSvg = () => frame(text(64, 280, 72, INK, "Bangladesh's Deadlock", 'font-weight="700"') + text(64, 370, 72, AMBER, 'PUG community', 'font-weight="700"') + text(64, 460, 30, MUTED, 'Live hero drafts, match stats and a community leaderboard.'));

/** Loaded on first use so a missing native binary costs a share image, not the whole server. */
export async function renderPng(svg: string): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  return Buffer.from(new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render().asPng());
}

export interface PageMeta { title: string; description: string; image: string; url: string }
export function withMeta(html: string, m: PageMeta): string {
  const tag = (attr: string, key: string, value: string) => `<meta ${attr}="${key}" content="${esc(value)}" />`;
  const tags = [
    tag('property', 'og:site_name', 'Deadlock PUG Bangladesh'), tag('property', 'og:type', 'website'), tag('property', 'og:title', m.title), tag('property', 'og:description', m.description),
    tag('property', 'og:url', m.url), tag('property', 'og:image', m.image), tag('property', 'og:image:width', String(W)), tag('property', 'og:image:height', String(H)),
    tag('name', 'twitter:card', 'summary_large_image'), tag('name', 'description', m.description),
  ].join('');
  return html.replace('</head>', () => `${tags}</head>`);
}
