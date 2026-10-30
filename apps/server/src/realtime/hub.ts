export interface Subscriber { send(data: string): void; readonly id: string }

/** Topic pub/sub for WebSocket clients. Topics: `dashboard`, `draft:<id>`, `match:<id>`, `match:<id>:mod`. */
export class Hub {
  private topics = new Map<string, Set<Subscriber>>();
  subscribe(topic: string, s: Subscriber) { (this.topics.get(topic) ?? this.topics.set(topic, new Set()).get(topic)!).add(s); }
  unsubscribe(topic: string, s: Subscriber) { this.topics.get(topic)?.delete(s); }
  unsubscribeAll(s: Subscriber) { for (const set of this.topics.values()) set.delete(s); }
  publish(topic: string, type: string, payload: unknown) {
    const msg = JSON.stringify({ type, topic, payload, serverNow: Date.now() });
    for (const s of this.topics.get(topic) ?? []) { try { s.send(msg); } catch { this.unsubscribeAll(s); } }
  }
  count(topic: string) { return this.topics.get(topic)?.size ?? 0; }
}
