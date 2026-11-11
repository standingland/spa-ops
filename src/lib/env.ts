import { createHash, timingSafeEqual } from 'node:crypto';

export type Env = {
  supabaseUrl: string; supabaseKey: string; serviceKey: string; cronSecret: string | null; senderName: string;
  appEnv: 'development' | 'production';
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
  return { supabaseUrl, supabaseKey, serviceKey, cronSecret, senderName: source.NOTIFY_SENDER_NAME?.trim() || 'Studio', appEnv };
}

/** Constant-time check of an `Authorization: Bearer <secret>` header. */
export function bearerMatches(header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
