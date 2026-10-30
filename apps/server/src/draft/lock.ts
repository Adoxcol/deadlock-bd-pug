import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export interface Lock { withLock<T>(key: string, fn: () => Promise<T>): Promise<T> }

export class LockBusyError extends Error { constructor() { super('Resource busy, retry'); } }

/** Single-process lock (tests / dev without Redis). Serializes callers per key. */
export class MemoryLock implements Lock {
  private chains = new Map<string, Promise<unknown>>();
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.chains.set(key, run);
    try { return await run; } finally { if (this.chains.get(key) === run) this.chains.delete(key); }
  }
}

/** Redis SET NX PX lock with token-checked release; short spin wait. */
export class RedisLock implements Lock {
  constructor(private redis: Redis, private ttlMs = 5000, private waitMs = 2000) {}
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const deadline = Date.now() + this.waitMs;
    while ((await this.redis.set(`lock:${key}`, token, 'PX', this.ttlMs, 'NX')) !== 'OK') {
      if (Date.now() > deadline) throw new LockBusyError();
      await new Promise((r) => setTimeout(r, 25));
    }
    try { return await fn(); } finally {
      await this.redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0", 1, `lock:${key}`, token);
    }
  }
}
