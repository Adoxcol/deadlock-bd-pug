import { describe, expect, it } from 'vitest';
import { callbackUrlFor, hashSecret, parseCallbackMatchId, verifyCallbackSecret } from '../src/lobby/callback.js';
import { createDeadlockApi } from '../src/tracker/deadlockApi.js';

describe('lobby callback helpers', () => {
  it('verifies the secret in constant time against a stored hash', () => {
    const h = hashSecret('s3cret');
    expect(verifyCallbackSecret('s3cret', h)).toBe(true);
    expect(verifyCallbackSecret('wrong', h)).toBe(false);
    expect(verifyCallbackSecret(undefined, h)).toBe(false);
    expect(verifyCallbackSecret(['s3cret'], h)).toBe(false);
    expect(verifyCallbackSecret('s3cret', null)).toBe(false);
  });
  it('parses match ids from the plausible body shapes only', () => {
    expect(parseCallbackMatchId({ match_id: 41000001 })).toBe('41000001');
    expect(parseCallbackMatchId({ matchId: '41000001' })).toBe('41000001');
    expect(parseCallbackMatchId('41000001')).toBe('41000001');
    expect(parseCallbackMatchId(41000001)).toBe('41000001');
    expect(parseCallbackMatchId({ match_id: 'abc' })).toBeNull();
    expect(parseCallbackMatchId({ match_id: 0 })).toBeNull();
    expect(parseCallbackMatchId({ match_id: '99999999999999999999999' })).toBeNull();
    expect(parseCallbackMatchId(null)).toBeNull();
  });
  it('only builds webhook URLs for public https hosts', () => {
    expect(callbackUrlFor('https://pugs.example.com', 'abc')).toBe('https://pugs.example.com/api/webhooks/deadlock-lobby/abc');
    expect(callbackUrlFor('http://pugs.example.com', 'abc')).toBeUndefined();
    expect(callbackUrlFor('https://localhost:5173', 'abc')).toBeUndefined();
    expect(callbackUrlFor('not a url', 'abc')).toBeUndefined();
  });
});

describe('createCustomLobby (mocked Deadlock API)', () => {
  it('sends the documented fields and maps the response', async () => {
    let sent: any; let headers: any;
    const api = createDeadlockApi('https://mock.invalid', 'key-1', (async (url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)); headers = init.headers;
      expect(new URL(url).pathname).toBe('/v1/matches/custom/create'); expect(init.method).toBe('POST');
      return new Response(JSON.stringify({ party_id: '123456789012345678', party_code: 'ABCDE', callback_secret: 'sec' }), { status: 200 });
    }) as typeof fetch);
    const r = await api.createCustomLobby({ callbackUrl: 'https://x/cb', serverRegion: 'singapore', minRosterSize: 12, isPubliclyVisible: true });
    expect(r).toEqual({ ok: true, data: { partyId: '123456789012345678', partyCode: 'ABCDE', callbackSecret: 'sec' } });
    expect(sent).toMatchObject({ callback_url: 'https://x/cb', server_region: 'singapore', min_roster_size: 12, is_publicly_visible: true });
    expect(headers['X-API-Key']).toBe('key-1');
  });
  it('maps rate limits and malformed responses to errors', async () => {
    const limited = createDeadlockApi('https://m.invalid', undefined, (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch);
    expect(await limited.createCustomLobby({})).toMatchObject({ ok: false, status: 'rate_limited' });
    const empty = createDeadlockApi('https://m.invalid', undefined, (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch);
    expect(await empty.createCustomLobby({})).toMatchObject({ ok: false, status: 'unavailable' });
  });
});
