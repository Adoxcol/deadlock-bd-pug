import type { LiveManager } from '../live/ingestor.js';

/**
 * Development simulator. Emits events in the same shape as deadlock-api live-events so the real
 * normalizer is exercised. All state it creates carries `simulated: true`.
 */
export function simulateMatch(live: LiveManager, matchId: string, players: Array<{ name: string; heroId: number; team: 'amber' | 'sapphire' }>, opts: { tickMs?: number; durationTicks?: number; rng?: () => number } = {}): Promise<'amber' | 'sapphire'> {
  const rng = opts.rng ?? Math.random; const tickMs = opts.tickMs ?? 1000; const total = opts.durationTicks ?? 120;
  live.startSimulated(matchId);
  const team = (t: 'amber' | 'sapphire') => (t === 'amber' ? 2 : 3);
  const stats = players.map((p, i) => ({ ...p, idx: i + 1, k: 0, d: 0, a: 0, nw: 600, dmg: 0 }));
  stats.forEach((p) => live.ingest(matchId, 'player_controller_entity_created', { tick: 0, game_time: 0, entity_index: p.idx, steam_id: 0, steam_name: p.name, team: team(p.team), hero_id: p.heroId, kills: 0, deaths: 0, assists: 0, net_worth: p.nw, hero_damage: 0 }));
  live.ingest(matchId, 'game_rules_proxy_entity_created', { tick: 0, game_time: 0, game_paused: false });
  const score = { 2: 0, 3: 0 } as Record<number, number>;
  let tick = 0;
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      tick++;
      const gt = tick * 15; // 15 game seconds per sim tick
      for (const p of stats) { p.nw += 150 + Math.floor(rng() * 250); p.dmg += Math.floor(rng() * 600); }
      if (rng() < 0.6) {
        const killer = stats[Math.floor(rng() * stats.length)]!;
        const victims = stats.filter((s) => s.team !== killer.team);
        const victim = victims[Math.floor(rng() * victims.length)]!;
        killer.k++; victim.d++; score[team(killer.team)]!++;
        const helper = stats.find((s) => s.team === killer.team && s !== killer && rng() < 0.5); if (helper) helper.a++;
        live.ingest(matchId, 'hero_killed', { tick, game_time: gt, attacker: killer.idx, victim: victim.idx });
      }
      if (tick === Math.floor(total / 2)) live.ingest(matchId, 'game_rules_proxy_entity_updated', { tick, game_time: gt, game_paused: true });
      if (tick === Math.floor(total / 2) + 2) live.ingest(matchId, 'game_rules_proxy_entity_updated', { tick, game_time: gt, game_paused: false });
      if (tick % 20 === 0) live.ingest(matchId, 'destroyable_building_entity_deleted', { tick, game_time: gt, entity_index: 500 + tick, team: rng() < 0.5 ? 2 : 3 });
      for (const p of stats) live.ingest(matchId, 'player_controller_entity_updated', { tick, game_time: gt, entity_index: p.idx, kills: p.k, deaths: p.d, assists: p.a, net_worth: p.nw, hero_damage: p.dmg });
      for (const t of [2, 3]) live.ingest(matchId, 'team_entity_updated', { tick, game_time: gt, team: t, score: score[t] });
      if (tick >= total) {
        clearInterval(iv);
        live.ingest(matchId, 'end', { tick: tick + 1, game_time: gt });
        resolve(score[2]! >= score[3]! ? 'amber' : 'sapphire');
      }
    }, tickMs);
  });
}
