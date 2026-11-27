import { parseEnv, type LineConfig } from './env';
import type { Sender } from '@/modules/notifications/dispatch';
import type { BookingConfirmationFlex } from '@/modules/notifications/flex';

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
  // The reason goes to the server log only (the guest sees one generic message); it never includes the code or a secret.
  const fail = (why: string) => new Error(`LINE_AUTH_FAILED: ${why}`);
  const lineError = async (r: Response) => {
    const b = (await r.json().catch(() => ({}))) as { error?: string; error_description?: string };
    return `${r.status} ${b.error ?? ''} ${b.error_description ?? ''}`.trim();
  };
  const t = await fetch(`${c.apiBase}/oauth2/v2.1/token`, form({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: c.loginChannelId, client_secret: c.loginChannelSecret,
  }));
  if (!t.ok) throw fail(`token exchange ${await lineError(t)} (redirect_uri sent: ${redirectUri})`);
  const idToken = ((await t.json()) as { id_token?: string }).id_token;
  if (!idToken) throw fail('token response has no id_token');
  const v = await fetch(`${c.apiBase}/oauth2/v2.1/verify`, form({ id_token: idToken, client_id: c.loginChannelId }));
  if (!v.ok) throw fail(`id token verify ${await lineError(v)}`);
  const p = (await v.json()) as { sub?: string; name?: string; nonce?: string };
  if (!p.sub || p.nonce !== expectedNonce) throw fail('id token has no sub or the nonce does not match');
  return { lineUserId: p.sub, name: p.name?.trim() || '' };
}

/** Sends one message. Throws (with the HTTP status) when LINE refuses the push. */
export async function pushLine(lineUserId: string, text: string, flex?: BookingConfirmationFlex): Promise<void> {
  const c = lineConfig();
  const r = await fetch(`${c.apiBase}/v2/bot/message/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${c.messagingToken}` },
    body: JSON.stringify({ to: lineUserId, messages: [flex ?? { type: 'text', text }] }),
  });
  if (!r.ok) throw new Error(`LINE_PUSH_FAILED ${r.status}`);
}

export const lineSender: Sender = {
  async send(m) {
    if (m.channel !== 'line') throw new Error('LINE_SENDER_CHANNEL');
    await pushLine(m.to, m.text, m.flex);
  },
};
