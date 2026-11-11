'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { addDays, bangkokDay, formatTime } from '@/lib/time';
import { copyWeekShifts, deleteShift, deleteTimeOff, saveShift, saveTherapist, saveTimeOff, setTherapistActive } from '../actions';

export type TherapistRow = {
  id: string; display_name: string; employment_type: 'employee' | 'freelance'; active: boolean; staff_user_id: string | null;
  therapist_services: { service_id: string }[];
};
export type ShiftRow = { id: string; therapist_id: string; start: string; end: string };
export type TimeOffRow = { id: string; therapist_id: string; start: string; end: string; kind: 'break' | 'leave' | 'absence'; note: string | null };
export type ServiceOpt = { id: string; name_th: string; name_en: string | null };
export type StaffOpt = { user_id: string; display_name: string };

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';
const local = (iso: string) => `${bangkokDay(iso)}T${formatTime(iso)}`;
const toIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : '');

export function TherapistsAdmin({ therapists, shifts, timeOff, services, staff, monday }: {
  therapists: TherapistRow[]; shifts: ShiftRow[]; timeOff: TimeOffRow[]; services: ServiceOpt[]; staff: StaffOpt[]; monday: string;
}) {
  const t = useTranslations('therapists');
  const c = useTranslations('common');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [panel, setPanel] = useState<null | { kind: 'therapist'; row: TherapistRow | null } | { kind: 'shift'; row: ShiftRow | null } | { kind: 'timeoff'; row: TimeOffRow | null }>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekdays = t.raw('weekdays') as string[];
  const dayLabel = (d: string, i: number) => `${weekdays[i]} ${d.slice(8)}/${d.slice(5, 7)}`;
  const svcName = (s: ServiceOpt) => (locale === 'en' && s.name_en ? s.name_en : s.name_th);

  async function run(p: Promise<{ ok: boolean; code?: string }>) {
    setError(null);
    const r = await p;
    if (!r.ok) setError(te(uiErrorKey(r.code ?? 'UNKNOWN')));
    else start(() => router.refresh());
    return r.ok;
  }

  const visible = useMemo(() => therapists.filter((x) =>
    (!q || x.display_name.toLowerCase().includes(q.toLowerCase())) && (!type || x.employment_type === type)), [therapists, q, type]);

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl">{t('title')}</h1>
        <input aria-label={c('search')} placeholder={c('search')} value={q} onChange={(e) => setQ(e.target.value)} className={field} data-testid="therapist-search" />
        <select aria-label={t('filterType')} value={type} onChange={(e) => setType(e.target.value)} className={field} data-testid="therapist-filter-type">
          <option value="">{c('all')}</option>
          <option value="employee">{t('employee')}</option>
          <option value="freelance">{t('freelance')}</option>
        </select>
        <span className="ml-auto flex flex-wrap gap-2 text-sm">
          <button className="rounded bg-charcoal px-3 py-1.5 text-ivory" data-testid="therapist-add" onClick={() => setPanel({ kind: 'therapist', row: null })}>{t('add')}</button>
          <button className="rounded border border-charcoal px-3 py-1.5" data-testid="shift-add" onClick={() => setPanel({ kind: 'shift', row: null })}>{t('addShift')}</button>
          <button className="rounded border border-charcoal px-3 py-1.5" data-testid="timeoff-add" onClick={() => setPanel({ kind: 'timeoff', row: null })}>{t('addTimeOff')}</button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link href={`/admin/therapists?week=${addDays(monday, -7)}`} data-testid="week-prev" className="underline">← {t('previousWeek')}</Link>
        <span className="tnum font-semibold" data-testid="week-label">{monday} – {days[6]}</span>
        <Link href={`/admin/therapists?week=${addDays(monday, 7)}`} data-testid="week-next" className="underline">{t('nextWeek')} →</Link>
        <button className="underline" data-testid="copy-week"
          onClick={() => run(copyWeekShifts(addDays(monday, -7), monday))}>{t('copyWeek')}</button>
      </div>

      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}

      {panel?.kind === 'therapist' && (
        <TherapistForm key={panel.row?.id ?? 'new'} row={panel.row} services={services} staff={staff} svcName={svcName}
          onCancel={() => setPanel(null)} onSave={async (i) => { if (await run(saveTherapist(i))) setPanel(null); }}
          onToggle={panel.row ? async () => { if (await run(setTherapistActive(panel.row!.id, !panel.row!.active))) setPanel(null); } : undefined} />
      )}
      {panel?.kind === 'shift' && (
        <ShiftForm key={panel.row?.id ?? 'new'} row={panel.row} therapists={therapists} defaultDay={monday}
          onCancel={() => setPanel(null)} onSave={async (i) => { if (await run(saveShift(i))) setPanel(null); }}
          onDelete={panel.row ? async () => { if (await run(deleteShift(panel.row!.id))) setPanel(null); } : undefined} />
      )}
      {panel?.kind === 'timeoff' && (
        <TimeOffForm key={panel.row?.id ?? 'new'} row={panel.row} therapists={therapists} defaultDay={monday}
          onCancel={() => setPanel(null)} onSave={async (i) => { if (await run(saveTimeOff(i))) setPanel(null); }}
          onDelete={panel.row ? async () => { if (await run(deleteTimeOff(panel.row!.id))) setPanel(null); } : undefined} />
      )}

      {visible.length === 0 && <p className="text-stone-dark">{c('empty')}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-ivory p-2 text-left">{t('therapist')}</th>
              {days.map((d, i) => <th key={d} className="tnum p-2 text-left font-medium">{dayLabel(d, i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((th) => (
              <tr key={th.id} data-testid="therapist-row" data-therapist-id={th.id} data-active={String(th.active)} className={`border-t border-stone align-top ${th.active ? '' : 'opacity-60'}`}>
                <th scope="row" className="sticky left-0 bg-ivory p-2 text-left font-medium">
                  <button className="underline" data-testid="therapist-edit" onClick={() => setPanel({ kind: 'therapist', row: th })}>{th.display_name}</button>
                  <div className="text-xs text-stone-dark">{t(th.employment_type)}{th.active ? '' : ` · ${c('inactive')}`}</div>
                </th>
                {days.map((d) => (
                  <td key={d} className="p-1" data-day={d}>
                    {shifts.filter((s) => s.therapist_id === th.id && bangkokDay(s.start) === d).map((s) => (
                      <button key={s.id} data-testid="shift-block" data-day={d} data-start={s.start} data-end={s.end}
                        onClick={() => setPanel({ kind: 'shift', row: s })}
                        className="tnum mb-1 block w-full rounded bg-sage px-2 py-1 text-left text-white">{formatTime(s.start)}–{formatTime(s.end)}</button>
                    ))}
                    {timeOff.filter((o) => o.therapist_id === th.id && bangkokDay(o.start) === d).map((o) => (
                      <button key={o.id} data-testid="timeoff-block" data-day={d} onClick={() => setPanel({ kind: 'timeoff', row: o })}
                        className="tnum mb-1 block w-full rounded bg-clay px-2 py-1 text-left text-white">{t(`kind.${o.kind}`)} {formatTime(o.start)}–{formatTime(o.end)}</button>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TherapistForm({ row, services, staff, svcName, onSave, onCancel, onToggle }: {
  row: TherapistRow | null; services: ServiceOpt[]; staff: StaffOpt[]; svcName: (s: ServiceOpt) => string;
  onSave: (i: Parameters<typeof saveTherapist>[0]) => void; onCancel: () => void; onToggle?: () => void;
}) {
  const t = useTranslations('therapists');
  const c = useTranslations('common');
  const [name, setName] = useState(row?.display_name ?? '');
  const [type, setType] = useState<'employee' | 'freelance'>(row?.employment_type ?? 'employee');
  const [link, setLink] = useState(row?.staff_user_id ?? '');
  const [svc, setSvc] = useState<string[]>(row?.therapist_services.map((x) => x.service_id) ?? services.map((s) => s.id));
  return (
    <form className="grid gap-3 rounded border border-stone bg-white p-4 sm:grid-cols-2" aria-label={row ? t('edit') : t('add')}
      onSubmit={(e) => { e.preventDefault(); onSave({ id: row?.id, displayName: name, employmentType: type, staffUserId: link || null, serviceIds: svc }); }}>
      <label className="flex flex-col text-sm">{t('name')}<input required value={name} onChange={(e) => setName(e.target.value)} className={field} data-testid="therapist-name" /></label>
      <label className="flex flex-col text-sm">{t('employment')}
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={field} data-testid="therapist-type">
          <option value="employee">{t('employee')}</option><option value="freelance">{t('freelance')}</option>
        </select>
      </label>
      <label className="flex flex-col text-sm">{t('linkedStaff')}
        <select value={link} onChange={(e) => setLink(e.target.value)} className={field} data-testid="therapist-link">
          <option value="">{t('linkNone')}</option>
          {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
        </select>
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm">{t('services')}</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={svc.includes(s.id)} onChange={(e) => setSvc(e.target.checked ? [...svc, s.id] : svc.filter((x) => x !== s.id))} />{svcName(s)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory" data-testid="therapist-save">{c('save')}</button>
        {onToggle && <button type="button" className="text-sm underline" data-testid="therapist-toggle" onClick={onToggle}>{row?.active ? c('deactivate') : c('activate')}</button>}
        <button type="button" onClick={onCancel} className="text-sm underline">{c('cancel')}</button>
      </div>
    </form>
  );
}

function ShiftForm({ row, therapists, defaultDay, onSave, onCancel, onDelete }: {
  row: ShiftRow | null; therapists: TherapistRow[]; defaultDay: string;
  onSave: (i: Parameters<typeof saveShift>[0]) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const t = useTranslations('therapists');
  const c = useTranslations('common');
  const [th, setTh] = useState(row?.therapist_id ?? therapists[0]?.id ?? '');
  const [start, setStart] = useState(row ? local(row.start) : `${defaultDay}T10:00`);
  const [end, setEnd] = useState(row ? local(row.end) : `${defaultDay}T22:00`);
  return (
    <form className="grid gap-3 rounded border border-stone bg-white p-4 sm:grid-cols-3" aria-label={row ? t('editShift') : t('addShift')}
      onSubmit={(e) => { e.preventDefault(); onSave({ id: row?.id, therapistId: th, start: toIso(start), end: toIso(end) }); }}>
      <label className="flex flex-col text-sm">{t('therapist')}
        <select value={th} onChange={(e) => setTh(e.target.value)} className={field} data-testid="shift-therapist">
          {therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-sm">{t('shiftStart')}<input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={field} data-testid="shift-start" /></label>
      <label className="flex flex-col text-sm">{t('shiftEnd')}<input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className={field} data-testid="shift-end" /></label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory" data-testid="shift-save">{c('save')}</button>
        {onDelete && <button type="button" className="text-sm underline" data-testid="shift-delete" onClick={onDelete}>{t('deleteShift')}</button>}
        <button type="button" onClick={onCancel} className="text-sm underline">{c('cancel')}</button>
      </div>
    </form>
  );
}

function TimeOffForm({ row, therapists, defaultDay, onSave, onCancel, onDelete }: {
  row: TimeOffRow | null; therapists: TherapistRow[]; defaultDay: string;
  onSave: (i: Parameters<typeof saveTimeOff>[0]) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const t = useTranslations('therapists');
  const c = useTranslations('common');
  const [th, setTh] = useState(row?.therapist_id ?? therapists[0]?.id ?? '');
  const [start, setStart] = useState(row ? local(row.start) : `${defaultDay}T12:00`);
  const [end, setEnd] = useState(row ? local(row.end) : `${defaultDay}T13:00`);
  const [kind, setKind] = useState<TimeOffRow['kind']>(row?.kind ?? 'break');
  const [note, setNote] = useState(row?.note ?? '');
  return (
    <form className="grid gap-3 rounded border border-stone bg-white p-4 sm:grid-cols-3" aria-label={t('addTimeOff')}
      onSubmit={(e) => { e.preventDefault(); onSave({ id: row?.id, therapistId: th, start: toIso(start), end: toIso(end), kind, note }); }}>
      <label className="flex flex-col text-sm">{t('therapist')}
        <select value={th} onChange={(e) => setTh(e.target.value)} className={field} data-testid="timeoff-therapist">
          {therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-sm">{t('timeOffStart')}<input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={field} data-testid="timeoff-start" /></label>
      <label className="flex flex-col text-sm">{t('timeOffEnd')}<input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className={field} data-testid="timeoff-end" /></label>
      <label className="flex flex-col text-sm">{t('timeOffKind')}
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={field} data-testid="timeoff-kind">
          {(['break', 'leave', 'absence'] as const).map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-sm sm:col-span-2">{t('timeOffNote')}<input value={note} onChange={(e) => setNote(e.target.value)} className={field} /></label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory" data-testid="timeoff-save">{c('save')}</button>
        {onDelete && <button type="button" className="text-sm underline" data-testid="timeoff-delete" onClick={onDelete}>{t('deleteTimeOff')}</button>}
        <button type="button" onClick={onCancel} className="text-sm underline">{c('cancel')}</button>
      </div>
    </form>
  );
}
