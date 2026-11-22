import { createClient } from '@supabase/supabase-js';

/** Service-key client for the server entry points listed in admin.test.ts. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
