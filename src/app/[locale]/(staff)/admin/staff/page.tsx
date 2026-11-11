import { requireRole } from '@/modules/identity/session';
import { listStaff } from '@/modules/identity/actions';
import { StaffAdmin } from '@/modules/identity/components/StaffAdmin';

export default async function StaffPage() {
  const session = await requireRole('owner');
  return <StaffAdmin staff={await listStaff()} me={session.userId} />;
}
