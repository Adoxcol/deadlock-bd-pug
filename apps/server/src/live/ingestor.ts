import { applyLiveEvent, emptyState, isStale, mapFrame, redactForPublic, type LiveMatchState, type MapDot } from './normalize.js';
import type { Hub } from '../realtime/hub.js';

export interface LiveView { state: LiveMatchState | null; map: MapDot[]; stale: boolean; publicDelaySec: number }

/**
 * One upstream subscription per match regardless of viewer count. Publishes:
 *  - `match:<id>:mod` full state immediately, including the overhead map
 *  - `match:<id>`    redacted scoreboard plus a map of x/y only, both delayed by publicDelaySec
 */
export class LiveManager {
  private states = new Map<string, LiveMatchState>();
  private aborts = new Map<string, AbortController>();
  private history = new Map<string, Array<{ at: number; state: LiveMatchState }>>();
  constructor(private hub: Hub, private liveEventsUrl: string | undefined, private publicDelaySec: number, private onEnd: (matchId: string, s: LiveMatchState) => void = () => {}) {
    setInterval(() => this.tickPublic(), 2000).unref();
  }

  get(matchId: string, moderator: boolean): LiveView | null {
    return this.view(matchId, moderator);
  }

  isTracking(matchId: string) { return this.aborts.has(matchId); }

  /** Real upstream: deadlock-api live-events SSE. Returns false if not configured. */
  start(internalId: string, deadlockMatchId: string): boolean {
    if (!this.liveEventsUrl || this.aborts.has(internalId)) return !!this.liveEventsUrl;
    const ac = new AbortController(); this.aborts.set(internalId, ac);
    this.states.set(internalId, emptyState(internalId));
    void this.consume(internalId, `${this.liveEventsUrl}/v1/matches/${deadlockMatchId}/live/demo/events`, ac.signal);
    return true;
  }

  private async consume(id: string, url: string, signal: AbortSignal, attempt = 0): Promise<void> {
    try {
      const res = await fetch(url, { signal, headers: { Accept: 'text/event-stream' } });
      if (!res.ok || !res.body) throw new Error(`live-events ${res.status}`);
      const dec = new TextDecoder(); let buf = ''; let ev = 'message'; let data = '';
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, ''); buf = buf.slice(nl + 1);
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
          else if (line === '') { if (data) this.ingest(id, ev, data); ev = 'message'; data = ''; }
        }
      }
      if (!this.states.get(id)?.completed) throw new Error('stream closed early');
    } catch (e) {
      if (signal.aborted) return;
      const wait = Math.min(30_000, 1000 * 2 ** attempt);
      console.warn(`[live] ${id} reconnect in ${wait}ms: ${(e as Error).message}`);
      if (attempt > 8) { this.stop(id); return; }
      await new Promise((r) => setTimeout(r, wait));
      return this.consume(id, url, signal, attempt + 1);
    }
  }

  ingest(id: string, event: string, raw: string | Record<string, unknown>) {
    const s = this.states.get(id); if (!s) return;
    let data: Record<string, unknown>;
    try { data = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : raw; } catch { return; }
    if (!applyLiveEvent(s, event, data)) return;
    const h = this.history.get(id) ?? []; h.push({ at: Date.now(), state: structuredClone(s) });
    while (h.length > 2 && h[1]!.at < Date.now() - (this.publicDelaySec + 10) * 1000) h.shift();
    this.history.set(id, h);
    const mod = this.view(id, true);
    if (mod) this.hub.publish(`match:${id}:mod`, 'live.state', mod);
    if (s.completed) { this.onEnd(id, s); this.stop(id); }
  }

  /** Simulation: create state without upstream. */
  startSimulated(id: string) { this.states.set(id, emptyState(id, true)); }

  stop(id: string) { this.aborts.get(id)?.abort(); this.aborts.delete(id); }

  /** Moderator sees the current frame. Everyone else sees the newest frame old enough to have passed the delay. A finished match is no longer sensitive. */
  private view(id: string, moderator: boolean): LiveView | null {
    const s = this.states.get(id);
    if (!s) return null;
    const raw = moderator || s.completed || this.publicDelaySec <= 0 ? s : this.snapshot(id, Date.now() - this.publicDelaySec * 1000);
    return {
      state: raw ? (moderator ? raw : redactForPublic(raw)) : null,
      map: raw ? mapFrame(raw) : [],
      stale: isStale(s),
      publicDelaySec: moderator ? 0 : this.publicDelaySec,
    };
  }

  private snapshot(id: string, cutoff: number): LiveMatchState | null {
    const h = this.history.get(id) ?? [];
    return [...h].reverse().find((x) => x.at <= cutoff)?.state ?? null;
  }

  private tickPublic() {
    for (const id of this.states.keys()) {
      if (this.hub.count(`match:${id}`) === 0) continue;
      const view = this.view(id, false);
      if (view) this.hub.publish(`match:${id}`, 'live.state', view);
    }
  }
}
