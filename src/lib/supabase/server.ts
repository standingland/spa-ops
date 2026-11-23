import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createMockSupabaseClient } from './mock';

/** Supabase client bound to the signed-in user's cookies (RLS applies). */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY?.trim();
  if (!url || !key) return createMockSupabaseClient();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component */ }
      },
    },
  });
}
