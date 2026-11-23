import { createClient } from '@supabase/supabase-js';
import { createMockSupabaseClient, normalizeSupabaseKey, normalizeSupabaseUrl } from './mock';

/** Service-key client for the server entry points listed in admin.test.ts. */
export function createAdminClient() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = normalizeSupabaseKey(process.env.SUPABASE_SERVICE_KEY);
  if (!url || !key) return createMockSupabaseClient();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
