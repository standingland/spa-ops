import { requireRole } from '@/modules/identity/session';
import { listWaitlist } from '@/modules/care/actions';
import { StaffWaitlist } from '@/modules/care/components/StaffWaitlist';
import { Alert } from '@/components/ui/alert';
import { getTranslations } from 'next-intl/server';
export default async function WaitlistPage() {
  await requireRole('owner', 'manager', 'receptionist'); const t = await getTranslations('care');
  const r = await listWaitlist(); return r.ok ? <StaffWaitlist rows={r.rows} /> : <Alert tone="error">{t('loadFailed')}</Alert>;
}
