export type IdentifierType = 'auto' | 'lobby' | 'party' | 'match';
export type ResolvedKind = 'lobby' | 'party' | 'match' | 'party_code' | 'unknown';

export interface Classified { kind: ResolvedKind; value: string; reason: string }

const DIGITS = /^\d{1,20}$/;
const PARTY_CODE = /^[A-Z0-9]{4,8}$/;
const U64_MAX = 18446744073709551615n;

/**
 * Deadlock IDs are all bare u64s, so a number alone cannot be told apart reliably.
 * Heuristic: Match IDs are currently 8-9 digit sequential numbers; party/lobby IDs are large (≥ 15 digits).
 * The moderator's explicit choice always wins.
 */
export function classifyIdentifier(raw: string, hint: IdentifierType = 'auto'): Classified {
  const value = raw.trim().replace(/^#/, '');
  if (!value) return { kind: 'unknown', value, reason: 'Empty identifier' };
  if (DIGITS.test(value)) {
    if (BigInt(value) > U64_MAX || BigInt(value) === 0n) return { kind: 'unknown', value, reason: 'Out of range for a Deadlock ID' };
    if (hint !== 'auto') return { kind: hint, value, reason: 'Type chosen by moderator' };
    if (value.length <= 11) return { kind: 'match', value, reason: 'Short numeric ID — looks like a Match ID' };
    return { kind: 'party', value, reason: 'Long numeric ID — treated as a party ID (lobby IDs cannot be looked up)' };
  }
  if (PARTY_CODE.test(value.toUpperCase())) {
    return { kind: 'party_code', value: value.toUpperCase(), reason: 'Looks like an in-game party join code; no public API resolves these' };
  }
  return { kind: 'unknown', value, reason: 'Not a recognised Deadlock identifier' };
}
