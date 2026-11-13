import { parseEnv, type LineConfig } from './env';
import type { Sender } from '@/modules/notifications/dispatch';

/** The configured LINE channels; throws when the LINE variables are not all set. */
export function lineConfig(): LineConfig {
  const c = parseEnv(process.env).line;
  if (!c) throw new Error('LINE_NOT_CONFIGURED');
  return c;
}

/** The LINE Login authorize URL. bot_prompt=aggressive asks the guest to add the Official Account as a friend. */
export function buildLoginUrl(a: { state: string; nonce: string; redirectUri: string }): string {
  const c = lineConfig();
  const u = new URL('/oauth2/v2.1/authorize', c.authBase);
  u.search = new URLSearchParams({
    response_type: 'code', client_id: c.loginChannelId, redirect_uri: a.redirectUri,
    state: a.state, nonce: a.nonce, scope: 'profile openid', bot_prompt: 'aggressive',
  }).toString();
  return u.toString();
}

const form = (o: Record<string, string>) => ({
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString(),
});

/** Trades the login code for the guest's LINE user id and display name, checking the ID token and the nonce. */
export async function exchangeCode(code: string, redirectUri: string, expectedNonce: string): Promise<{ lineUserId: string; name: string }> {
  const c = lineConfig();
  const fail = () => new Error('LINE_AUTH_FAILED');
  const t = await fetch(`${c.apiBase}/oauth2/v2.1/token`, form({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: c.loginChannelId, client_secret: c.loginChannelSecret,
  }));
  if (!t.ok) throw fail();
  const idToken = ((await t.json()) as { id_token?: string }).id_token;
  if (!idToken) throw fail();
  const v = await fetch(`${c.apiBase}/oauth2/v2.1/verify`, form({ id_token: idToken, client_id: c.loginChannelId }));
  if (!v.ok) throw fail();
  const p = (await v.json()) as { sub?: string; name?: string; nonce?: string };
  if (!p.sub || p.nonce !== expectedNonce) throw fail();
  return { lineUserId: p.sub, name: p.name?.trim() || '' };
}

/** Sends one text message. Throws (with the HTTP status) when LINE refuses, for example when the guest blocked the account. */
export async function pushLine(lineUserId: string, text: string): Promise<void> {
  const c = lineConfig();
  const r = await fetch(`${c.apiBase}/v2/bot/message/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${c.messagingToken}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!r.ok) throw new Error(`LINE_PUSH_FAILED ${r.status}`);
}

export const lineSender: Sender = {
  async send(m) {
    if (m.channel !== 'line') throw new Error('LINE_SENDER_CHANNEL');
    await pushLine(m.to, m.text);
  },
};
