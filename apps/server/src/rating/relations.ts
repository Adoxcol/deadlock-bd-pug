export interface MatchRow { resultId: string; userId: string | null; team: string; won: boolean }
export interface Relation { userId: string; games: number; wins: number }

/** Teammates ranked by wins together, rivals by games against. Two shared matches minimum, so one lucky game doesn't count. */
export function relations(playerId: string, rows: MatchRow[], limit = 5): { teammates: Relation[]; rivals: Relation[] } {
  const mine = new Map(rows.filter((r) => r.userId === playerId).map((r) => [r.resultId, r]));
  const withThem = new Map<string, Relation>(), against = new Map<string, Relation>();
  for (const r of rows) {
    const me = mine.get(r.resultId);
    if (!me || !r.userId || r.userId === playerId) continue;
    const table = r.team === me.team ? withThem : against;
    const row = table.get(r.userId) ?? { userId: r.userId, games: 0, wins: 0 };
    row.games++; if (me.won) row.wins++;
    table.set(r.userId, row);
  }
  const rank = (t: Map<string, Relation>, by: (a: Relation, b: Relation) => number) => [...t.values()].filter((x) => x.games >= 2).sort(by).slice(0, limit);
  return { teammates: rank(withThem, (a, b) => b.wins - a.wins || b.games - a.games), rivals: rank(against, (a, b) => b.games - a.games || a.wins - b.wins) };
}
