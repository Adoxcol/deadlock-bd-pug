/** Thin client for endpoints verified in docs/API_FEASIBILITY.md. Never called from browsers. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 'not_found' | 'rate_limited' | 'unavailable'; message: string };

export interface DeadlockApi {
  partyMatchId(partyId: string): Promise<ApiResult<{ matchId: string }>>;
  matchMetadata(matchId: string): Promise<ApiResult<unknown>>;
}

export function createDeadlockApi(baseUrl: string, apiKey?: string, fetchImpl: typeof fetch = fetch): DeadlockApi {
  async function get<T>(path: string): Promise<ApiResult<T>> {
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        headers: apiKey ? { 'X-API-Key': apiKey } : {}, signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return { ok: false, status: 'not_found', message: 'Not found' };
      if (res.status === 429) return { ok: false, status: 'rate_limited', message: 'Deadlock API rate limit reached' };
      if (!res.ok) return { ok: false, status: 'unavailable', message: `Deadlock API returned ${res.status}` };
      return { ok: true, data: (await res.json()) as T };
    } catch (e) {
      return { ok: false, status: 'unavailable', message: `Deadlock API unreachable: ${(e as Error).message}` };
    }
  }
  return {
    async partyMatchId(partyId) {
      const r = await get<{ match_id: number | string }>(`/v1/matches/custom/${partyId}/match-id`);
      return r.ok ? { ok: true, data: { matchId: String(r.data.match_id) } } : r;
    },
    matchMetadata: (matchId) => get(`/v1/matches/${matchId}/metadata`),
  };
}
