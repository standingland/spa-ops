import { createHash, timingSafeEqual } from 'node:crypto';

export type Env = {
  supabaseUrl: string; supabaseKey: string; serviceKey: string; cronSecret: string | null; senderName: string;
  appEnv: 'development' | 'production';
  /** Null until every LINE variable is set; the public booking page stays closed while it is null. */
  line: LineConfig | null;
};
export type LineConfig = {
  loginChannelId: string; loginChannelSecret: string; messagingToken: string; publicBaseUrl: string; tokenSecret: string;
  apiBase: string; authBase: string;
};

/** Reads and checks the configuration. Throws one Error naming every problem at once, so a deploy fails with the whole list. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const problems: string[] = [];
  const need = (name: string): string => {
    const v = source[name]?.trim();
    if (!v) { problems.push(`${name}: missing`); return ''; }
    return v;
  };
  const appEnv = source.APP_ENV === 'production' ? 'production' : 'development';
  const supabaseUrl = need('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = need('NEXT_PUBLIC_SUPABASE_KEY');
  const serviceKey = need('SUPABASE_SERVICE_KEY');
  const cronSecret = source.CRON_SECRET?.trim() || null;
  const line = parseLine(source, problems, appEnv);

  let url: URL | null = null;
  if (supabaseUrl) {
    try { url = new URL(supabaseUrl); } catch { problems.push('NEXT_PUBLIC_SUPABASE_URL: not a valid URL'); }
  }
  if (appEnv === 'production') {
    if (url && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      problems.push('NEXT_PUBLIC_SUPABASE_URL: production needs an https address that is not localhost');
    }
    if (!cronSecret) problems.push('CRON_SECRET: required in production');
    else if (cronSecret.length < 32 || cronSecret === 'local-dev-only') problems.push('CRON_SECRET: must be at least 32 characters and not the development value');
    if (serviceKey && serviceKey === supabaseKey) problems.push('SUPABASE_SERVICE_KEY: must differ from the public key');
  }
  if (problems.length) throw new Error(`ENV: ${problems.join('; ')}`);
  return { supabaseUrl, supabaseKey, serviceKey, cronSecret, senderName: source.NOTIFY_SENDER_NAME?.trim() || 'Studio', appEnv, line };
}

const LINE_VARS = ['LINE_LOGIN_CHANNEL_ID', 'LINE_LOGIN_CHANNEL_SECRET', 'LINE_MESSAGING_TOKEN', 'PUBLIC_BASE_URL', 'PUBLIC_TOKEN_SECRET'] as const;

/** All five LINE variables or none: a half-configured public page is a startup error, not a silent failure. */
function parseLine(source: Record<string, string | undefined>, problems: string[], appEnv: string): LineConfig | null {
  const v = Object.fromEntries(LINE_VARS.map((k) => [k, source[k]?.trim() ?? ''])) as Record<(typeof LINE_VARS)[number], string>;
  if (!LINE_VARS.some((k) => v[k])) return null;
  for (const k of LINE_VARS) if (!v[k]) problems.push(`${k}: missing (set all LINE variables or none)`);
  if (v.PUBLIC_TOKEN_SECRET && v.PUBLIC_TOKEN_SECRET.length < 32) problems.push('PUBLIC_TOKEN_SECRET: must be at least 32 characters');
  if (v.PUBLIC_BASE_URL) { try { new URL(v.PUBLIC_BASE_URL); } catch { problems.push('PUBLIC_BASE_URL: not a valid URL'); } }
  // the address overrides exist for the browser tests; in production they would send the channel secret to another host
  if (appEnv === 'production') for (const k of ['LINE_API_BASE', 'LINE_AUTH_BASE']) if (source[k]?.trim()) problems.push(`${k}: must not be set in production`);
  return {
    loginChannelId: v.LINE_LOGIN_CHANNEL_ID, loginChannelSecret: v.LINE_LOGIN_CHANNEL_SECRET, messagingToken: v.LINE_MESSAGING_TOKEN,
    publicBaseUrl: v.PUBLIC_BASE_URL.replace(/[/]$/, ''), tokenSecret: v.PUBLIC_TOKEN_SECRET,
    apiBase: source.LINE_API_BASE?.trim() || 'https://api.line.me', authBase: source.LINE_AUTH_BASE?.trim() || 'https://access.line.me',
  };
}

/** Constant-time check of an `Authorization: Bearer <secret>` header. */
export function bearerMatches(header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
