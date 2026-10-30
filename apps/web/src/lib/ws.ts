import { ref } from 'vue';

type Handler = (msg: { type: string; topic: string; payload: any; serverNow: number }) => void;

/** Single shared socket; re-subscribes all topics after reconnect (server sends a fresh snapshot). */
class Realtime {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private retry = 0;
  connected = ref(false);
  /** serverNow - clientNow, smoothed; used for timer display. */
  clockOffset = ref(0);

  private connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.connected.value = true; this.retry = 0; for (const t of this.handlers.keys()) ws.send(JSON.stringify({ op: 'sub', topic: t })); };
    ws.onclose = () => { this.connected.value = false; this.ws = null; if (this.handlers.size) setTimeout(() => this.connect(), Math.min(10_000, 500 * 2 ** this.retry++)); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (typeof msg.serverNow === 'number') this.clockOffset.value = this.clockOffset.value * 0.7 + (msg.serverNow - Date.now()) * 0.3;
      for (const h of this.handlers.get(msg.topic) ?? []) h(msg);
    };
  }
  subscribe(topic: string, h: Handler): () => void {
    const set = this.handlers.get(topic) ?? new Set();
    const isNew = !this.handlers.has(topic);
    set.add(h); this.handlers.set(topic, set);
    this.connect();
    if (isNew && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ op: 'sub', topic }));
    return () => {
      set.delete(h);
      if (!set.size) { this.handlers.delete(topic); if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ op: 'unsub', topic })); }
    };
  }
  now() { return Date.now() + this.clockOffset.value; }
}
export const realtime = new Realtime();
