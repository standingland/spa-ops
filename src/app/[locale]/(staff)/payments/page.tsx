import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { bangkokDay } from '@/lib/time';
import { getDayLedger, listAllPaymentMethods } from '@/modules/payments/actions';
import { Reconciliation } from '@/modules/payments/components/Reconciliation';
import { MethodsAdmin } from '@/modules/payments/components/MethodsAdmin';

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const session = await requireRole('owner', 'manager');
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : bangkokDay(new Date());
  const ledger = await getDayLedger(day);
  if (!ledger.ok) return <Alert tone="error">{ledger.code}</Alert>;
  const methods = session.role === 'owner' ? await listAllPaymentMethods() : null;
  return (
    <div className="flex flex-col gap-10">
      <Reconciliation day={day} summary={ledger.summary} entries={ledger.entries} closing={ledger.closing} />
      {methods?.ok && <MethodsAdmin methods={methods.methods} />}
    </div>
  );
}
