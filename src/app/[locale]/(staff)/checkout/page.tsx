import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { canRecordPayments, getPendingPayments, listPaymentMethods } from '@/modules/payments/actions';
import { PendingPayments } from '@/modules/payments/components/PendingPayments';

/** Front-desk checkout: bookings that still owe money. Reception can record payments but never see the day ledger. */
export default async function CheckoutPage() {
  const session = await requireRole('owner', 'manager', 'receptionist');
  const [t, nav, pending, methods, canRecord] = await Promise.all([
    getTranslations('payments'), getTranslations('nav'),
    getPendingPayments(), listPaymentMethods(), canRecordPayments(session.role),
  ]);
  if (!pending.ok || !methods.ok) return <Alert tone="error">{t('loadFailed')}</Alert>;
  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero title={nav('checkout')} description={t('checkoutDesc')} />
      {!canRecord && <Alert tone="info">{t('recordingOff')}</Alert>}
      <PendingPayments rows={pending.rows} methods={methods.methods} canRecord={canRecord} shared={false} />
    </div>
  );
}
