import { createClient } from '@supabase/supabase-js';
import { createMockSupabaseClient } from './mock';

/** Service-key client for the server entry points listed in admin.test.ts. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) return createMockSupabaseClient();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
