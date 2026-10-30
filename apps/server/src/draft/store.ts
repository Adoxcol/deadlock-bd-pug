import type { DraftState, DraftHistoryEntry } from './types.js';

export interface DraftRecord { id: string; name: string; pugId: string | null; teamNames: { amber: string; sapphire: string }; visibility: 'public' | 'private'; simulated: boolean; state: DraftState }

export interface DraftStore {
  get(id: string): Promise<DraftRecord | null>;
  create(rec: DraftRecord): Promise<void>;
  /** Persist new state; must fail if stored seq != expectedPrevSeq (optimistic concurrency, second line of defence after the lock). */
  save(id: string, expectedPrevSeq: number, state: DraftState, newHistory: DraftHistoryEntry[]): Promise<void>;
  listActive(): Promise<DraftRecord[]>;
}

export class ConcurrencyError extends Error {}

export class MemoryDraftStore implements DraftStore {
  rows = new Map<string, DraftRecord>();
  async get(id: string) { const r = this.rows.get(id); return r ? structuredClone(r) : null; }
  async create(rec: DraftRecord) { this.rows.set(rec.id, structuredClone(rec)); }
  async save(id: string, prev: number, state: DraftState) {
    const r = this.rows.get(id);
    if (!r || r.state.seq !== prev) throw new ConcurrencyError('seq mismatch');
    r.state = structuredClone(state);
  }
  async listActive() { return [...this.rows.values()].filter((r) => ['waiting', 'drafting', 'paused'].includes(r.state.status)).map((r) => structuredClone(r)); }
}
