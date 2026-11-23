import { createBrowserClient } from '@supabase/ssr';
import { createMockSupabaseClient } from './mock';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY?.trim();
  if (!url || !key) return createMockSupabaseClient();
  return createBrowserClient(url, key);
}
