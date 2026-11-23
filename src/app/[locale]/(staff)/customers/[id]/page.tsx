import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { getCustomer, listCustomers } from '@/modules/customers/actions';
import { CustomerList } from '@/modules/customers/components/CustomerList';
import { CustomerProfile } from '@/modules/customers/components/CustomerProfile';
import { getPreferences } from '@/modules/care/actions';

export default async function CustomerPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireRole('owner', 'manager', 'receptionist');
  const [{ id }, sp, locale, t, design] = await Promise.all([params, searchParams, getLocale(), getTranslations('customers'), getTranslations('workspaceDesign')]);
  const r = await getCustomer(id);
  if (!r.ok) {
    if (r.code === 'INVALID_INPUT' || r.code === 'NOT_AUTHORIZED') notFound();
    return <Alert tone="error">{r.code}</Alert>;
  }
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const [svcs, ths, rooms, directory, preferences] = await Promise.all([
    supabase.from('services').select('id, name_th, name_en'),
    supabase.from('therapists').select('id, display_name').order('sort_order'),
    supabase.from('rooms').select('id, code'),
    listCustomers({ q: sp.q, page }),
    getPreferences(id),
  ]);
  const names = {
    services: Object.fromEntries((svcs.data ?? []).map((s) => [s.id, locale === 'en' && s.name_en ? s.name_en : s.name_th])),
    therapists: Object.fromEntries((ths.data ?? []).map((x) => [x.id, x.display_name])),
    rooms: Object.fromEntries((rooms.data ?? []).map((x) => [x.id, x.code])),
  };
  return (
    <div className="customer-directory">
      <WorkspaceHero title={t('title')} description={design('customersDesc')} icon="guests" />
      <div className="customer-directory-grid customer-directory-detail">
        <div>{directory.ok && <CustomerList rows={directory.rows} total={directory.total} page={page}
          q={sp.q ?? ''} isOwner={session.role === 'owner'} selectedId={id} allowCreate={false} />}</div>
        <CustomerProfile key={id} customer={r.customer} role={session.role} names={names} preferences={preferences} />
      </div>
    </div>
  );
}
