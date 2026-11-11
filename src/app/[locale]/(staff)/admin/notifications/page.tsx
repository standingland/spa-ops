import { requireRole } from '@/modules/identity/session';
import { listOutbox } from '@/modules/notifications/actions';
import { OutboxAdmin } from '@/modules/notifications/components/OutboxAdmin';

export default async function NotificationsPage() {
  await requireRole('owner', 'manager');
  const r = await listOutbox();
  return <OutboxAdmin rows={r.ok ? r.rows : []} />;
}
