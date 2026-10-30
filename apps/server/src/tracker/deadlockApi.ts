/** Thin client for endpoints verified in docs/API_FEASIBILITY.md. Never called from browsers. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 'not_found' | 'rate_limited' | 'unavailable'; message: string };

/** Options for POST /v1/matches/custom/create (see docs/API_FEASIBILITY.md). */
export interface CreateLobbyOptions {
  callbackUrl?: string; serverRegion?: string; minRosterSize?: number; isPubliclyVisible?: boolean;
  duplicateHeroesEnabled?: boolean; randomizeLanes?: boolean;
}
export interface CreatedLobby { partyId: string; partyCode: string; callbackSecret: string | null }

export interface DeadlockApi {
  partyMatchId(partyId: string): Promise<ApiResult<{ matchId: string }>>;
  matchMetadata(matchId: string): Promise<ApiResult<unknown>>;
  createCustomLobby(opts: CreateLobbyOptions): Promise<ApiResult<CreatedLobby>>;
}

export function createDeadlockApi(baseUrl: string, apiKey?: string, fetchImpl: typeof fetch = fetch): DeadlockApi {
  async function get<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<ApiResult<T>> {
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: { ...(apiKey ? { 'X-API-Key': apiKey } : {}), ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
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
    async createCustomLobby(o) {
      // Creating the party waits for the in-game party code, so allow a longer timeout.
      const r = await get<{ party_id: string | number; party_code: string; callback_secret?: string | null }>('/v1/matches/custom/create', {
        method: 'POST', timeoutMs: 45_000,
        body: {
          callback_url: o.callbackUrl, server_region: o.serverRegion, min_roster_size: o.minRosterSize,
          is_publicly_visible: o.isPubliclyVisible, duplicate_heroes_enabled: o.duplicateHeroesEnabled, randomize_lanes: o.randomizeLanes,
        },
      });
      if (!r.ok) return r;
      if (!r.data?.party_id || !r.data.party_code) return { ok: false, status: 'unavailable', message: 'Deadlock API returned no party code' };
      return { ok: true, data: { partyId: String(r.data.party_id), partyCode: r.data.party_code, callbackSecret: r.data.callback_secret ?? null } };
    },
  };
}
