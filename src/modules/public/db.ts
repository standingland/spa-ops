import { createAdminClient } from '@/lib/supabase/admin';

/** The service-key client for the public page. Every public_* database function is callable only through it. */
export const publicDb = () => createAdminClient();
