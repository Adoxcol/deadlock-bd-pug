import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';

export interface SessionData { userId: string; createdAt: number }
export interface SessionStore {
  create(data: SessionData): Promise<string>;
  get(id: string): Promise<SessionData | null>;
  destroy(id: string): Promise<void>;
  /** Short-lived values (OAuth state). */
  putTemp(key: string, value: string, ttlSec: number): Promise<void>;
  takeTemp(key: string): Promise<string | null>;
}
const TTL = 60 * 60 * 24 * 14;

export class RedisSessionStore implements SessionStore {
  constructor(private r: Redis) {}
  async create(d: SessionData) { const id = randomBytes(32).toString('base64url'); await this.r.set(`sess:${id}`, JSON.stringify(d), 'EX', TTL); return id; }
  async get(id: string) { const v = await this.r.get(`sess:${id}`); return v ? (JSON.parse(v) as SessionData) : null; }
  async destroy(id: string) { await this.r.del(`sess:${id}`); }
  async putTemp(k: string, v: string, ttl: number) { await this.r.set(`tmp:${k}`, v, 'EX', ttl); }
  async takeTemp(k: string) { return this.r.getdel(`tmp:${k}`); }
}

export class MemorySessionStore implements SessionStore {
  private m = new Map<string, { v: string; exp: number }>();
  async create(d: SessionData) { const id = randomBytes(32).toString('base64url'); this.m.set(`sess:${id}`, { v: JSON.stringify(d), exp: Date.now() + TTL * 1000 }); return id; }
  async get(id: string) { const e = this.m.get(`sess:${id}`); return e && e.exp > Date.now() ? (JSON.parse(e.v) as SessionData) : null; }
  async destroy(id: string) { this.m.delete(`sess:${id}`); }
  async putTemp(k: string, v: string, ttl: number) { this.m.set(`tmp:${k}`, { v, exp: Date.now() + ttl * 1000 }); }
  async takeTemp(k: string) { const e = this.m.get(`tmp:${k}`); this.m.delete(`tmp:${k}`); return e && e.exp > Date.now() ? e.v : null; }
}
