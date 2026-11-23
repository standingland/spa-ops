import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { createMockSupabaseClient, normalizeSupabaseKey, normalizeSupabaseUrl } from './mock';

/** Supabase client bound to the signed-in user's cookies (RLS applies). */
export async function createClient() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = normalizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_KEY);
  if (!url || !key) return createMockSupabaseClient();
  const [store, hdrs] = await Promise.all([cookies(), headers()]);
  const isHttps = hdrs.get('x-forwarded-proto') === 'https';
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) =>
            store.set(name, value, isHttps ? { ...options, sameSite: 'none', secure: true } : options),
          );
        } catch { /* called from a Server Component */ }
      },
    },
  });
}
