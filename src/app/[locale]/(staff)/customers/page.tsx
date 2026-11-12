import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { getRetentionCandidates, listCustomers } from '@/modules/customers/actions';
import { CustomerList } from '@/modules/customers/components/CustomerList';
import { RetentionList } from '@/modules/customers/components/RetentionList';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; tab?: string }> }) {
  const session = await requireRole('owner', 'manager', 'receptionist');
  const sp = await searchParams;
  if (sp.tab === 'retention') {
    await requireRole('owner');
    const r = await getRetentionCandidates();
    if (!r.ok) return <Alert tone="error">{r.code}</Alert>;
    return <RetentionList rows={r.rows} months={r.months} />;
  }
  const page = Math.max(1, Number(sp.page) || 1);
  const r = await listCustomers({ q: sp.q, page });
  if (!r.ok) return <Alert tone="error">{r.code}</Alert>;
  return <CustomerList rows={r.rows} total={r.total} page={page} q={sp.q ?? ''} isOwner={session.role === 'owner'} />;
}
