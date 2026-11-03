/**
 * Normalizes deadlock-api live-events SSE payloads (see live-events/README.md upstream)
 * into a compact match state. Unknown metrics stay `null` — never coerced to 0.
 */
export interface LivePlayer {
  entityIndex: number; steamId: string | null; name: string | null; team: number | null; heroId: number | null;
  kills: number | null; deaths: number | null; assists: number | null;
  /** Soul total. Live-events reports this as `net_worth`; the two fields stay equal. */
  netWorth: number | null; souls: number | null; heroDamage: number | null;
  health: number | null; level: number | null;
  position: [number, number, number] | null;
  lastTick: number;
}
export interface TimelineEvent { key: string; tick: number; gameTime: number | null; kind: 'kill' | 'objective' | 'pause' | 'resume' | 'end'; detail: Record<string, unknown> }
export interface LiveMatchState {
  matchId: string; gameTime: number | null; paused: boolean | null; completed: boolean;
  teams: Record<string, { score: number | null; name: string | null }>;
  bannedHeroIds: number[] | null;
  players: Record<number, LivePlayer>;
  timeline: TimelineEvent[];
  lastTick: number; lastEventAt: number | null; simulated: boolean;
}

export function emptyState(matchId: string, simulated = false): LiveMatchState {
  return { matchId, gameTime: null, paused: null, completed: false, teams: {}, bannedHeroIds: null, players: {}, timeline: [], lastTick: -1, lastEventAt: null, simulated };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const OBJECTIVES = new Set(['destroyable_building', 'boss_tier2', 'boss_tier3', 'mid_boss', 'trooper_barrack_boss']);

function pushTimeline(s: LiveMatchState, e: TimelineEvent): boolean {
  if (s.timeline.some((t) => t.key === e.key)) return false;
  s.timeline.push(e);
  s.timeline.sort((a, b) => a.tick - b.tick);
  return true;
}

/** Applies one event in place. Returns true if state changed. Idempotent for duplicate events. */
export function applyLiveEvent(s: LiveMatchState, name: string, data: Record<string, unknown>, now = Date.now()): boolean {
  const tick = num(data.tick) ?? s.lastTick;
  const gameTime = num(data.game_time);
  s.lastEventAt = now;
  if (tick > s.lastTick) { s.lastTick = tick; if (gameTime !== null) s.gameTime = gameTime; }

  if (name === 'end') { s.completed = true; return pushTimeline(s, { key: 'end', tick, gameTime, kind: 'end', detail: {} }) || true; }
  if (name === 'banned_heroes' && Array.isArray(data.banned_hero_ids)) { s.bannedHeroIds = data.banned_hero_ids.filter((x): x is number => typeof x === 'number'); return true; }
  if (name === 'hero_killed') {
    return pushTimeline(s, { key: `kill:${tick}:${String(data.victim ?? data.victim_entity ?? '')}:${String(data.attacker ?? '')}`, tick, gameTime, kind: 'kill', detail: data });
  }
  const m = /^(.+)_entity_(created|updated|deleted)$/.exec(name);
  if (!m) return false;
  const [, type, delta] = m as unknown as [string, string, string];
  const idx = num(data.entity_index);

  if (type === 'player_controller' && idx !== null) {
    const prev = s.players[idx];
    if (prev && tick < prev.lastTick) return false; // out-of-order
    const p: LivePlayer = prev ?? { entityIndex: idx, steamId: null, name: null, team: null, heroId: null, kills: null, deaths: null, assists: null, netWorth: null, souls: null, heroDamage: null, health: null, level: null, position: null, lastTick: tick };
    if (data.steam_id !== undefined) p.steamId = String(data.steam_id);
    if (typeof data.steam_name === 'string') p.name = data.steam_name;
    p.team = num(data.team) ?? p.team; p.heroId = num(data.hero_id) ?? p.heroId;
    p.kills = num(data.kills) ?? p.kills; p.deaths = num(data.deaths) ?? p.deaths; p.assists = num(data.assists) ?? p.assists;
    const worth = num(data.net_worth);
    if (worth !== null) { p.netWorth = worth; p.souls = worth; }
    p.heroDamage = num(data.hero_damage) ?? p.heroDamage;
    p.lastTick = tick; s.players[idx] = p;
    return true;
  }
  if (type === 'player_pawn') {
    const hero = num(data.hero_id);
    const p = Object.values(s.players).find((x) => hero !== null && x.heroId === hero) ?? (idx !== null ? s.players[idx] : undefined);
    if (!p) return false;
    let changed = false;
    if (Array.isArray(data.position)) { p.position = data.position as [number, number, number]; changed = true; }
    const hp = num(data.health); if (hp !== null) { p.health = hp; changed = true; }
    const lvl = num(data.level); if (lvl !== null) { p.level = lvl; changed = true; }
    return changed;
  }
  if (type === 'team') {
    const t = String(num(data.team) ?? '?');
    const cur = s.teams[t] ?? { score: null, name: null };
    cur.score = num(data.score) ?? cur.score;
    if (typeof data.teamname === 'string') cur.name = data.teamname;
    s.teams[t] = cur; return true;
  }
  if (type === 'game_rules_proxy' && typeof data.game_paused === 'boolean') {
    const was = s.paused; s.paused = data.game_paused;
    if (was !== null && was !== s.paused) pushTimeline(s, { key: `${s.paused ? 'pause' : 'resume'}:${tick}`, tick, gameTime, kind: s.paused ? 'pause' : 'resume', detail: {} });
    return true;
  }
  if (OBJECTIVES.has(type) && delta === 'deleted' && idx !== null) {
    return pushTimeline(s, { key: `obj:${type}:${idx}`, tick, gameTime, kind: 'objective', detail: { type, team: data.team ?? null } });
  }
  return false;
}

export function isStale(s: LiveMatchState, now = Date.now(), thresholdMs = 15_000): boolean {
  return !s.completed && (s.lastEventAt === null || now - s.lastEventAt > thresholdMs);
}

/** Dots for the overhead map: team, hero, and x/y only. No names, steam ids, net worth, or height. */
export interface MapDot { heroId: number | null; team: number | null; x: number; y: number }

export function mapFrame(s: LiveMatchState): MapDot[] {
  const dots: MapDot[] = [];
  for (const p of Object.values(s.players)) {
    const pos = p.position;
    if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    dots.push({ heroId: p.heroId, team: p.team, x: pos[0], y: pos[1] });
  }
  return dots;
}

/** Public spectator view: no positions, no net worth (economy info is competitively sensitive). */
export function redactForPublic(s: LiveMatchState): LiveMatchState {
  const players: Record<number, LivePlayer> = {};
  for (const [k, p] of Object.entries(s.players)) players[Number(k)] = { ...p, position: null, netWorth: null, souls: null };
  return { ...s, players };
}
