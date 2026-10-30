/** Steam OpenID 2.0 — verification is always done server-to-server with check_authentication. */
const OP = 'https://steamcommunity.com/openid/login';
const STEAM_ID_OFFSET = 76561197960265728n;

export function steamLoginUrl(returnTo: string, realm: string): string {
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo, 'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${OP}?${p}`;
}

export async function verifySteamAssertion(query: Record<string, string>, expectedReturnTo: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (query['openid.mode'] !== 'id_res') return null;
  if (!query['openid.return_to']?.startsWith(expectedReturnTo)) return null;
  if (query['openid.op_endpoint'] !== OP) return null;
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(query['openid.claimed_id'] ?? '');
  if (!m) return null;
  const body = new URLSearchParams({ ...query, 'openid.mode': 'check_authentication' });
  const res = await fetchImpl(OP, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  return /is_valid\s*:\s*true/.test(text) ? m[1]! : null;
}

export const steam64ToAccountId = (id64: string) => (BigInt(id64) - STEAM_ID_OFFSET).toString();
