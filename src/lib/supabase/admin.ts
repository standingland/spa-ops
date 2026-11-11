import { createClient } from '@supabase/supabase-js';

/** Service-key client. Server only; imported only by src/modules/identity/actions.ts. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
