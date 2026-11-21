import { requireRole } from '@/modules/identity/session';
import { listApplications } from '@/modules/careers/adminActions';
import { ApplicationsAdmin } from '@/modules/careers/components/ApplicationsAdmin';

export default async function ApplicationsPage() {
  await requireRole('owner', 'manager');
  return <ApplicationsAdmin applications={await listApplications()} />;
}
