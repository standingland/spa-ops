'use client';

import { useMemo, useState, useTransition } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { addDays, bangkokDay, formatTime } from '@/lib/time';
import { copyWeekShifts, deleteShift, deleteTimeOff, removeTherapistPhoto, saveShift, saveTherapist, saveTimeOff, setTherapistActive, uploadTherapistPhoto } from '../actions';
import { ImageDecodeError, resizeToJpeg } from '@/lib/resizeImage';
import { Avatar } from '@/components/ui/avatar';
import { recordAbsence } from '@/modules/operations/actions';
import type { AbsenceInput } from '@/modules/operations/schema';

export type TherapistRow = {
  id: string; display_name: string; employment_type: 'employee' | 'freelance'; active: boolean; staff_user_id: string | null; photo_path: string | null;
  public: boolean; bio_th: string | null; bio_en: string | null; specialties: string[];
  therapist_services: { service_id: string }[];
};
export type ShiftRow = { id: string; therapist_id: string; start: string; end: string };
export type TimeOffRow = { id: string; therapist_id: string; start: string; end: string; kind: 'break' | 'leave' | 'absence'; note: string | null };
export type ServiceOpt = { id: string; name_th: string; name_en: string | null };
export type StaffOpt = { user_id: string; display_name: string };

const local = (iso: string) => `${bangkokDay(iso)}T${formatTime(iso)}`;
const toIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : '');

export function TherapistsAdmin({ therapists, shifts, timeOff, services, staff, monday, photoUrls, initiallyCreating = false }: {
  therapists: TherapistRow[]; shifts: ShiftRow[]; timeOff: TimeOffRow[]; services: ServiceOpt[]; staff: StaffOpt[]; monday: string; photoUrls: Record<string, string>; initiallyCreating?: boolean;
}) {
  const t = useTranslations('therapists');
  const c = useTranslations('common');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState<AbsenceInput | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [panel, setPanel] = useState<null | { kind: 'therapist'; row: TherapistRow | null } | { kind: 'shift'; row: ShiftRow | null } | { kind: 'timeoff'; row: TimeOffRow | null }>(
    initiallyCreating ? { kind: 'therapist', row: null } : null,
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekdays = t.raw('weekdays') as string[];
  const dayLabel = (d: string, i: number) => `${weekdays[i]} ${d.slice(8)}/${d.slice(5, 7)}`;
  const svcName = (s: ServiceOpt) => (locale === 'en' && s.name_en ? s.name_en : s.name_th);

  async function choosePhoto(th: TherapistRow, file: File | undefined) {
    if (!file) return;
    setError(null);
    let jpeg: Blob;
    try { jpeg = await resizeToJpeg(file); } catch (e) {
      if (e instanceof ImageDecodeError) { setError(t('photo.unreadable')); return; }
      throw e;
    }
    const form = new FormData();
    form.set('therapistId', th.id);
    form.set('file', new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }));
    await run(uploadTherapistPhoto(form));
  }

  async function runFull<R extends { ok: boolean; code?: string }>(p: Promise<R>): Promise<R> {
    setError(null);
    const r = await p;
    if (!r.ok) setError(errorText(te(uiErrorKey(r.code ?? 'UNKNOWN')), r));
    else start(() => router.refresh());
    return r;
  }
  async function run(p: Promise<{ ok: boolean; code?: string }>) {
    return (await runFull(p)).ok;
  }

  const visible = useMemo(() => therapists.filter((x) =>
    (!q || x.display_name.toLowerCase().includes(q.toLowerCase())) && (!type || x.employment_type === type)), [therapists, q, type]);

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <PageHeader title={t('title')}
        actions={<>
          <Button data-testid="therapist-add" onClick={() => setPanel({ kind: 'therapist', row: null })}>{t('add')}</Button>
          <Button variant="secondary" data-testid="shift-add" onClick={() => setPanel({ kind: 'shift', row: null })}>{t('addShift')}</Button>
          <Button variant="secondary" data-testid="timeoff-add" onClick={() => setPanel({ kind: 'timeoff', row: null })}>{t('addTimeOff')}</Button>
        </>} />
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={c('search')} placeholder={c('search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-auto min-w-0 max-w-full" data-testid="therapist-search" />
        <Select aria-label={t('filterType')} value={type} onChange={(e) => setType(e.target.value)} className="w-auto min-w-0 max-w-full" data-testid="therapist-filter-type">
          <option value="">{c('all')}</option>
          <option value="employee">{t('employee')}</option>
          <option value="freelance">{t('freelance')}</option>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={`/admin/therapists?week=${addDays(monday, -7)}`} data-testid="week-prev" className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">← {t('previousWeek')}</Link>
        <span className="tnum font-semibold" data-testid="week-label">{monday} – {days[6]}</span>
        <Link href={`/admin/therapists?week=${addDays(monday, 7)}`} data-testid="week-next" className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">{t('nextWeek')} →</Link>
        <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="copy-week"
          onClick={() => run(copyWeekShifts(addDays(monday, -7), monday))}>{t('copyWeek')}</Button>
      </div>

      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}

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
          onCancel={() => { setPanel(null); setForce(null); }}
          onSave={async (i) => {
            setNotice(null);
            const r = await runFull(saveTimeOff(i));
            if (r.ok) { setPanel(null); setForce(null); return; }
            if (r.code === 'CONFLICTS_WITH_BOOKINGS' && !i.id) setForce({ therapistId: i.therapistId, start: i.start, end: i.end, kind: i.kind, note: i.note });
          }}
          onDelete={panel.row ? async () => { if (await run(deleteTimeOff(panel.row!.id))) setPanel(null); } : undefined} />
      )}
      {panel?.kind === 'timeoff' && force && (
        <Card tone="danger" className="flex flex-wrap items-center gap-3 p-3">
          <span className="min-w-0 break-words">{te('exceptions.forceHint')}</span>
          <Button variant="danger" size="sm" data-testid="force-confirm"
            onClick={async () => {
              const r = await runFull(recordAbsence(force));
              if (r.ok) { setNotice(te('exceptions.forced', { count: r.affected.length })); setForce(null); setPanel(null); }
            }}>{te('exceptions.forceConfirm')}</Button>
        </Card>
      )}
      {notice && <Alert className="break-words">{notice}</Alert>}

      {visible.length === 0 && <EmptyState>{c('empty')}</EmptyState>}
      <div tabIndex={0} className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-body">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface p-2 text-left">{t('therapist')}</th>
              {days.map((d, i) => <th key={d} className="tnum p-2 text-left font-medium">{dayLabel(d, i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((th) => (
              <tr key={th.id} data-testid="therapist-row" data-therapist-id={th.id} data-active={String(th.active)} className={`border-t border-line align-top ${th.active ? '' : 'opacity-60'}`}>
                <th scope="row" className="sticky left-0 min-w-40 max-w-56 break-words bg-surface p-2 text-left font-medium">
                  <div className="flex items-start gap-2">
                    <span data-testid={`therapist-photo-${th.id}`}><Avatar name={th.display_name} src={th.photo_path ? photoUrls[th.photo_path] : null} /></span>
                    <div className="min-w-0">
                      <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="therapist-edit" onClick={() => setPanel({ kind: 'therapist', row: th })}>{th.display_name}</Button>
                      <div className="text-caption text-ink-muted">{t(th.employment_type)}{th.active ? '' : ` · ${c('inactive')}`}</div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <label className="inline-flex min-h-11 cursor-pointer items-center text-caption text-primary underline focus-within:ring-2 focus-within:ring-focus pointer-fine:min-h-0">
                          {th.photo_path ? t('photo.change') : t('photo.add')}
                          <input type="file" accept="image/*" className="sr-only" data-testid={`therapist-photo-input-${th.id}`}
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void choosePhoto(th, f); }} />
                        </label>
                        {th.photo_path && (
                          <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid={`therapist-photo-remove-${th.id}`}
                            onClick={() => run(removeTherapistPhoto(th.id))}>{t('photo.remove')}</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </th>
                {days.map((d) => (
                  <td key={d} className="p-1" data-day={d}>
                    {shifts.filter((s) => s.therapist_id === th.id && bangkokDay(s.start) === d).map((s) => (
                      <button key={s.id} data-testid="shift-block" data-day={d} data-start={s.start} data-end={s.end}
                        onClick={() => setPanel({ kind: 'shift', row: s })}
                        className="tnum mb-1 block min-h-11 w-full rounded-[var(--radius)] bg-primary px-2 py-1 text-left text-primary-foreground pointer-fine:min-h-0">{formatTime(s.start)}–{formatTime(s.end)}</button>
                    ))}
                    {timeOff.filter((o) => o.therapist_id === th.id && bangkokDay(o.start) === d).map((o) => (
                      <button key={o.id} data-testid="timeoff-block" data-day={d} onClick={() => setPanel({ kind: 'timeoff', row: o })}
                        className="tnum mb-1 block min-h-11 w-full rounded-[var(--radius)] bg-danger px-2 py-1 text-left text-white pointer-fine:min-h-0">{t(`kind.${o.kind}`)} {formatTime(o.start)}–{formatTime(o.end)}</button>
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
  const [isPublic, setIsPublic] = useState(row?.public ?? false);
  const [bioTh, setBioTh] = useState(row?.bio_th ?? '');
  const [bioEn, setBioEn] = useState(row?.bio_en ?? '');
  const [tags, setTags] = useState((row?.specialties ?? []).join(', '));
  return (
    <Card>
    <form className="grid gap-3 sm:grid-cols-2" aria-label={row ? t('edit') : t('add')}
      onSubmit={(e) => { e.preventDefault(); onSave({ id: row?.id, displayName: name, employmentType: type, staffUserId: link || null, serviceIds: svc, public: isPublic, bioTh, bioEn, specialties: tags.split(',').map((s) => s.trim()).filter(Boolean) }); }}>
      <Field label={t('name')}><Input required value={name} onChange={(e) => setName(e.target.value)} data-testid="therapist-name" /></Field>
      <Field label={t('employment')}>
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} data-testid="therapist-type">
          <option value="employee">{t('employee')}</option><option value="freelance">{t('freelance')}</option>
        </Select>
      </Field>
      <Field label={t('linkedStaff')}>
        <Select value={link} onChange={(e) => setLink(e.target.value)} data-testid="therapist-link">
          <option value="">{t('linkNone')}</option>
          {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-3 sm:col-span-2">
        <legend className="text-caption text-ink-muted">{t('publicProfile.legend')}</legend>
        <label className="flex min-h-11 items-center gap-2 text-body text-ink">
          <input type="checkbox" className="size-5 accent-primary" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} data-testid="therapist-public" />
          <span className="min-w-0 break-words">{t('publicProfile.show')}</span>
        </label>
        <p className="text-caption text-ink-muted" data-testid="therapist-public-help">{t('publicProfile.help')}</p>
        <Field label={t('publicProfile.bioTh')}><Input value={bioTh} maxLength={500} onChange={(e) => setBioTh(e.target.value)} data-testid="therapist-bio-th" /></Field>
        <Field label={t('publicProfile.bioEn')}><Input value={bioEn} maxLength={500} onChange={(e) => setBioEn(e.target.value)} data-testid="therapist-bio-en" /></Field>
        <Field label={t('publicProfile.specialties')}><Input value={tags} onChange={(e) => setTags(e.target.value)} data-testid="therapist-specialties" /></Field>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="text-caption text-ink-muted">{t('services')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {services.map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-2 text-body text-ink">
              <input type="checkbox" className="size-5 accent-primary" checked={svc.includes(s.id)} onChange={(e) => setSvc(e.target.checked ? [...svc, s.id] : svc.filter((x) => x !== s.id))} /><span className="min-w-0 break-words">{svcName(s)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" data-testid="therapist-save">{c('save')}</Button>
        {onToggle && <Button type="button" variant="secondary" data-testid="therapist-toggle" onClick={onToggle}>{row?.active ? c('deactivate') : c('activate')}</Button>}
        <Button type="button" variant="secondary" onClick={onCancel}>{c('cancel')}</Button>
      </div>
    </form>
    </Card>
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
    <Card>
    <form className="grid gap-3 sm:grid-cols-3" aria-label={row ? t('editShift') : t('addShift')}
      onSubmit={(e) => { e.preventDefault(); onSave({ id: row?.id, therapistId: th, start: toIso(start), end: toIso(end) }); }}>
      <Field label={t('therapist')}>
        <Select value={th} onChange={(e) => setTh(e.target.value)} data-testid="shift-therapist">
          {therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
        </Select>
      </Field>
      <Field label={t('shiftStart')}><Input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} data-testid="shift-start" /></Field>
      <Field label={t('shiftEnd')}><Input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} data-testid="shift-end" /></Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="submit" data-testid="shift-save">{c('save')}</Button>
        {onDelete && <Button type="button" variant="secondary" data-testid="shift-delete" onClick={onDelete}>{t('deleteShift')}</Button>}
        <Button type="button" variant="secondary" onClick={onCancel}>{c('cancel')}</Button>
      </div>
    </form>
    </Card>
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
    <Card>
    <form className="grid gap-3 sm:grid-cols-3" aria-label={t('addTimeOff')}
      onSubmit={(e) => { e.preventDefault(); onSave({ id: row?.id, therapistId: th, start: toIso(start), end: toIso(end), kind, note }); }}>
      <Field label={t('therapist')}>
        <Select value={th} onChange={(e) => setTh(e.target.value)} data-testid="timeoff-therapist">
          {therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
        </Select>
      </Field>
      <Field label={t('timeOffStart')}><Input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} data-testid="timeoff-start" /></Field>
      <Field label={t('timeOffEnd')}><Input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} data-testid="timeoff-end" /></Field>
      <Field label={t('timeOffKind')}>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} data-testid="timeoff-kind">
          {(['break', 'leave', 'absence'] as const).map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2"><Field label={t('timeOffNote')}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="submit" data-testid="timeoff-save">{c('save')}</Button>
        {onDelete && <Button type="button" variant="secondary" data-testid="timeoff-delete" onClick={onDelete}>{t('deleteTimeOff')}</Button>}
        <Button type="button" variant="secondary" onClick={onCancel}>{c('cancel')}</Button>
      </div>
    </form>
    </Card>
  );
}
