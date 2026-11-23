import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { addDays, bangkokDay, bangkokDayRange, mondayOf, parseRange } from '@/lib/time';
import { getRowsNow } from '@/modules/operations/actions';
import { photoUrls } from '@/modules/therapists/actions';
import { therapistsNow } from '@/modules/operations/onShift';
import { NowStrip, type NowPerson } from '@/modules/therapists/components/NowStrip';
import {
  TherapistsAdmin, type ServiceOpt, type ShiftRow, type StaffOpt, type TherapistRow, type TimeOffRow,
} from '@/modules/therapists/components/TherapistsAdmin';

export default async function TherapistsPage({ searchParams }: { searchParams: Promise<{ week?: string; create?: string }> }) {
  await requireRole('owner', 'manager');
  const { week, create } = await searchParams;
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : bangkokDay(new Date()));
  const range = `[${bangkokDayRange(monday).from},${bangkokDayRange(addDays(monday, 6)).to})`;
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowRange = `[${nowIso},${new Date(now.getTime() + 1000).toISOString()})`;
  const [ths, shifts, off, svcs, staff, nowShifts, nowOff, rooms, board] = await Promise.all([
    supabase.from('therapists').select('id, display_name, employment_type, active, staff_user_id, photo_path, public, bio_th, bio_en, specialties, therapist_services(service_id)').order('sort_order'),
    supabase.from('therapist_shifts').select('id, therapist_id, during').filter('during', 'ov', range),
    supabase.from('therapist_time_off').select('id, therapist_id, during, kind, note').filter('during', 'ov', range),
    supabase.from('services').select('id, name_th, name_en').eq('active', true).order('sort_order'),
    supabase.from('staff').select('user_id, display_name').eq('role', 'therapist').eq('active', true),
    supabase.from('therapist_shifts').select('therapist_id, during').filter('during', 'ov', nowRange),
    supabase.from('therapist_time_off').select('therapist_id, during').filter('during', 'ov', nowRange),
    supabase.from('rooms').select('id, code, display_name'),
    getRowsNow(nowIso),
  ]);
  const t = await getTranslations('therapists');
  const spans = (rows: { therapist_id: string; during: unknown }[] | null) =>
    (rows ?? []).map((r) => ({ therapistId: r.therapist_id, ...parseRange(r.during as string) }));
  const therapistRows = (ths.data ?? []) as TherapistRow[];
  const paths = therapistRows.flatMap((x) => (x.photo_path ? [x.photo_path] : []));
  const urls = await photoUrls(paths);
  const roomName = new Map((rooms.data ?? []).map((r) => [r.id, r.display_name || r.code]));
  const people: NowPerson[] = therapistsNow({ now: nowIso, shifts: spans(nowShifts.data), timeOff: spans(nowOff.data), rows: board.ok ? board.rows : [] })
    .flatMap((n) => {
      const th = therapistRows.find((x) => x.id === n.therapistId);
      return th?.active ? [{ therapistId: n.therapistId, name: th.display_name, photoUrl: th.photo_path ? (urls[th.photo_path] ?? null) : null, state: n.state, roomName: n.roomId ? (roomName.get(n.roomId) ?? null) : null }] : [];
    });
  const initiallyCreating = create === '1';
  return (
    <>
    <NowStrip people={people} labels={{
      title: t('now.title'), empty: t('now.empty'),
      state: { in_treatment: t('now.state.in_treatment'), on_break: t('now.state.on_break'), free: t('now.state.free') },
      inRoom: (room) => t('now.inRoom', { room }),
    }} />
    <TherapistsAdmin
      key={initiallyCreating ? 'create' : 'browse'}
      initiallyCreating={initiallyCreating}
      monday={monday}
      therapists={therapistRows}
      photoUrls={urls}
      shifts={(shifts.data ?? []).map((s) => ({ id: s.id, therapist_id: s.therapist_id, ...parseRange(s.during as string) })) as ShiftRow[]}
      timeOff={(off.data ?? []).map((o) => ({ id: o.id, therapist_id: o.therapist_id, kind: o.kind, note: o.note, ...parseRange(o.during as string) })) as TimeOffRow[]}
      services={(svcs.data ?? []) as ServiceOpt[]}
      staff={(staff.data ?? []) as StaffOpt[]}
    />
    </>
  );
}
