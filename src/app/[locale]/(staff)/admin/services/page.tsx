import { requireRole } from '@/modules/identity/session';

export default async function Page() {
  await requireRole('owner', 'manager');
  return <div />;
}
