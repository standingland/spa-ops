import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { getCustomer } from '@/modules/customers/actions';
import { CustomerProfile } from '@/modules/customers/components/CustomerProfile';
import { getPreferences } from '@/modules/care/actions';

export default async function CustomerPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireRole('owner', 'manager', 'receptionist');
  const [{ id }, sp, locale] = await Promise.all([params, searchParams, getLocale()]);
  const r = await getCustomer(id);
  if (!r.ok) {
    if (r.code === 'INVALID_INPUT' || r.code === 'NOT_AUTHORIZED') notFound();
    return <Alert tone="error">{r.code}</Alert>;
  }
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const [svcs, ths, rooms, preferences] = await Promise.all([
    supabase.from('services').select('id, name_th, name_en'),
    supabase.from('therapists').select('id, display_name').order('sort_order'),
    supabase.from('rooms').select('id, code'),
    getPreferences(id),
  ]);
  const names = {
    services: Object.fromEntries((svcs.data ?? []).map((s) => [s.id, locale === 'en' && s.name_en ? s.name_en : s.name_th])),
    therapists: Object.fromEntries((ths.data ?? []).map((x) => [x.id, x.display_name])),
    rooms: Object.fromEntries((rooms.data ?? []).map((x) => [x.id, x.code])),
  };
  const backQuery = { ...(sp.q ? { q: sp.q } : {}), ...(page > 1 ? { page: String(page) } : {}) };
  return (
    <CustomerProfile
      key={`${id}:${r.customer.anonymisedAt ?? ''}`}
      customer={r.customer}
      role={session.role}
      names={names}
      preferences={preferences}
      backQuery={backQuery}
    />
  );
}
