import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/modules/identity/session';

export default async function CalendarPage() {
  await requireRole();
  const t = await getTranslations('nav');
  return <h1 className="text-2xl">{t('calendar')}</h1>;
}
