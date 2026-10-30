export function discordAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'identify', state, prompt: 'none' });
  return `https://discord.com/oauth2/authorize?${p}`;
}

export interface DiscordUser { id: string; username: string; global_name: string | null; avatar: string | null }

export async function exchangeDiscordCode(code: string, clientId: string, secret: string, redirectUri: string): Promise<DiscordUser> {
  const tok = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  if (!tok.ok) throw new Error(`Discord token exchange failed (${tok.status})`);
  const { access_token } = (await tok.json()) as { access_token: string };
  const me = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
  if (!me.ok) throw new Error(`Discord user fetch failed (${me.status})`);
  return (await me.json()) as DiscordUser;
}
