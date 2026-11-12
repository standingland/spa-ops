import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { getSettings } from '@/modules/settings/actions';
import { SettingsForm } from '@/modules/settings/components/SettingsForm';

export default async function SettingsPage() {
  await requireRole('owner');
  const r = await getSettings();
  if (!r.ok) return <Alert tone="error">{r.code}</Alert>;
  return <SettingsForm initial={r.settings} />;
}
