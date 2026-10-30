import { createHash, timingSafeEqual } from 'node:crypto';

export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

/** Constant-time check of the X-Callback-Secret header against the stored hash. */
export function verifyCallbackSecret(header: string | string[] | undefined, storedHash: string | null): boolean {
  if (!storedHash || typeof header !== 'string' || !header) return false;
  const a = Buffer.from(hashSecret(header), 'hex'), b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * deadlock-api documents only that the match-start POST carries "the match ID"; the exact body shape is not
 * documented, so accept the plausible forms and reject anything that is not a positive u64.
 */
export function parseCallbackMatchId(body: unknown): string | null {
  const pick = (v: unknown): string | null => {
    const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
    return /^\d{1,20}$/.test(s) && BigInt(s) > 0n && BigInt(s) <= 18446744073709551615n ? s : null;
  };
  if (typeof body === 'number' || typeof body === 'string') return pick(body);
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    return pick(o.match_id) ?? pick(o.matchId) ?? pick(o.match_id_str) ?? null;
  }
  return null;
}

/**
 * Webhooks only work when deadlock-api can reach us: a public https URL. On localhost we fall back to polling.
 */
export function callbackUrlFor(publicUrl: string, matchRowId: string): string | undefined {
  try {
    const u = new URL(publicUrl);
    if (u.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(u.hostname) || u.hostname.endsWith('.local')) return undefined;
    return `${u.origin}/api/webhooks/deadlock-lobby/${encodeURIComponent(matchRowId)}`;
  } catch { return undefined; }
}
