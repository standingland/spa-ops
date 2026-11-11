import { requireRole } from '@/modules/identity/session';
import { getSettings } from '@/modules/settings/actions';
import { SettingsForm } from '@/modules/settings/components/SettingsForm';

export default async function SettingsPage() {
  await requireRole('owner');
  const r = await getSettings();
  if (!r.ok) return <p role="alert" className="text-clay">{r.code}</p>;
  return <SettingsForm initial={r.settings} />;
}
