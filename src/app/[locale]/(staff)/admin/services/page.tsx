import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { ServicesAdmin, type CategoryRow, type ServiceRow } from '@/modules/catalog/components/ServicesAdmin';

export default async function ServicesPage() {
  await requireRole('owner', 'manager');
  const supabase = await createClient();
  const [services, cats] = await Promise.all([
    supabase.from('services').select('*, service_room_categories(room_category_id)').order('sort_order'),
    supabase.from('room_categories').select('id,name_th,name_en').order('sort_order'),
  ]);
  return <ServicesAdmin services={(services.data ?? []) as ServiceRow[]} categories={(cats.data ?? []) as CategoryRow[]} />;
}
