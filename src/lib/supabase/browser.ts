import { createBrowserClient } from '@supabase/ssr';
import { createMockSupabaseClient, normalizeSupabaseKey, normalizeSupabaseUrl } from './mock';

export function createClient() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = normalizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_KEY);
  if (!url || !key) return createMockSupabaseClient();
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return createBrowserClient(url, key, isHttps ? { cookieOptions: { sameSite: 'none', secure: true } } : undefined);
}
