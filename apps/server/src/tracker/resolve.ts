import { classifyIdentifier, type IdentifierType } from './identifier.js';
import type { DeadlockApi } from './deadlockApi.js';

export type TrackingState =
  | 'waiting_for_lobby' | 'lobby_found' | 'waiting_for_match' | 'match_detected' | 'live_available'
  | 'live_unavailable' | 'match_completed' | 'match_data_pending' | 'match_not_found' | 'api_unavailable'
  | 'manual_required';

export interface ResolveOutcome { state: TrackingState; matchId: string | null; partyId: string | null; explanation: string }

export async function resolveIdentifier(api: DeadlockApi, raw: string, hint: IdentifierType): Promise<ResolveOutcome> {
  const c = classifyIdentifier(raw, hint);
  switch (c.kind) {
    case 'match': {
      const md = await api.matchMetadata(c.value);
      if (md.ok) return { state: 'match_completed', matchId: c.value, partyId: null, explanation: 'Final match metadata is available.' };
      if (md.status === 'not_found') return { state: 'match_detected', matchId: c.value, partyId: null, explanation: 'Match ID accepted. No final metadata yet — the match may still be in progress, or data for private matches may never be published.' };
      return { state: 'api_unavailable', matchId: c.value, partyId: null, explanation: md.message };
    }
    case 'party': {
      const r = await api.partyMatchId(c.value);
      if (r.ok) return { state: 'match_detected', matchId: r.data.matchId, partyId: c.value, explanation: 'Party resolved to a Match ID via the Deadlock API.' };
      if (r.status === 'not_found') return { state: 'waiting_for_match', matchId: null, partyId: c.value, explanation: 'No Match ID yet. This only resolves for lobbies created through the Deadlock API bot, after the match starts. Enter the Match ID manually if the lobby was created in-game.' };
      return { state: 'api_unavailable', matchId: null, partyId: c.value, explanation: r.message };
    }
    case 'lobby':
      return { state: 'manual_required', matchId: null, partyId: null, explanation: 'The Deadlock API has no lookup by lobby ID. Enter the Match ID shown in-game or after the match.' };
    case 'party_code':
      return { state: 'manual_required', matchId: null, partyId: null, explanation: 'Party join codes cannot be resolved by any public API. Enter the Match ID instead.' };
    default:
      return { state: 'match_not_found', matchId: null, partyId: null, explanation: c.reason };
  }
}
