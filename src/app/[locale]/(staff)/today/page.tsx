import { getLocale, getTranslations } from 'next-intl/server';
import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { getOpenReports, getToday } from '@/modules/operations/actions';
import { TodayBoard } from '@/modules/operations/components/TodayBoard';
import { canRecordPayments, getPendingPayments, listPaymentMethods } from '@/modules/payments/actions';

export default async function TodayPage() {
  const session = await requireRole();
  const locale = await getLocale();
  const t = await getTranslations('today');
  const supabase = await createClient();
  const desk = session.role !== 'therapist';
  const [today, reports, svcs, ths, rooms, pending, methods, canRecord] = await Promise.all([
    getToday(),
    getOpenReports(),
    supabase.from('services').select('id, name_th, name_en'),
    supabase.from('therapists').select('id, display_name'),
    supabase.from('rooms').select('id, code'),
    desk ? getPendingPayments() : Promise.resolve(null),
    desk ? listPaymentMethods() : Promise.resolve(null),
    desk ? canRecordPayments(session.role) : Promise.resolve(false),
  ]);
  if (!today.ok) return <p role="alert" className="text-clay">{t('nothing')}</p>;
  const names = {
    services: Object.fromEntries((svcs.data ?? []).map((s) => [s.id, locale === 'en' && s.name_en ? s.name_en : s.name_th])),
    therapists: Object.fromEntries((ths.data ?? []).map((x) => [x.id, x.display_name])),
    rooms: Object.fromEntries((rooms.data ?? []).map((r) => [r.id, r.code])),
  };
  return <TodayBoard model={today.model} role={session.role} names={names} reports={reports.ok ? reports.reports : []}
    pending={pending?.ok ? pending.rows : []} methods={methods?.ok ? methods.methods : []} canRecord={canRecord} />;
}
