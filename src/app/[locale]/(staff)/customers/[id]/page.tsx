import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/modules/identity/session';
import { getCustomer } from '@/modules/customers/actions';
import { CustomerProfile } from '@/modules/customers/components/CustomerProfile';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('owner', 'manager', 'receptionist');
  const { id } = await params;
  const locale = await getLocale();
  const r = await getCustomer(id);
  if (!r.ok) {
    if (r.code === 'INVALID_INPUT' || r.code === 'NOT_AUTHORIZED') notFound();
    return <p role="alert" className="text-clay">{r.code}</p>;
  }
  const supabase = await createClient();
  const [svcs, ths, rooms] = await Promise.all([
    supabase.from('services').select('id, name_th, name_en'),
    supabase.from('therapists').select('id, display_name').order('sort_order'),
    supabase.from('rooms').select('id, code'),
  ]);
  const names = {
    services: Object.fromEntries((svcs.data ?? []).map((s) => [s.id, locale === 'en' && s.name_en ? s.name_en : s.name_th])),
    therapists: Object.fromEntries((ths.data ?? []).map((x) => [x.id, x.display_name])),
    rooms: Object.fromEntries((rooms.data ?? []).map((x) => [x.id, x.code])),
  };
  return <CustomerProfile customer={r.customer} role={session.role} names={names} />;
}
