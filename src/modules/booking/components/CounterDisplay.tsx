'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { bangkokDay, formatTime } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import { bookingStatusStyle } from '@/components/ui/status';
import { counterSlot, counterVisible } from '../counter';
import type { BoardRow } from '../actions';
import type { RoomOpt, TherapistOpt } from './types';

const TABLES = ['bookings', 'rooms', 'room_positions', 'therapists', 'room_blocks', 'therapist_shifts', 'therapist_time_off'] as const;

export function CounterDisplay({ brand, day, rows, rooms, therapists }: { brand: string; day: string; rows: BoardRow[]; rooms: RoomOpt[]; therapists: TherapistOpt[] }) {
  const locale = useLocale();
  const th = locale === 'th';
  const t = useTranslations('booking');
  const router = useRouter();
  const live = useLiveRefresh(TABLES);
  const [now, setNow] = useState<Date | null>(null);
  const [by, setBy] = useState<'rooms' | 'therapists'>('rooms');
  const [names, setNames] = useState(false);
  const [full, setFull] = useState(false);
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const tick = () => { const date = new Date(); setNow(date); if (bangkokDay(date) !== day) router.refresh(); };
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 15000);
    const onVisible = () => { if (!document.hidden) { tick(); router.refresh(); } };
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('fullscreenchange', onFull);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); document.removeEventListener('fullscreenchange', onFull); };
  }, [day, router]);

  const active = rows.filter(counterVisible);
  const slots = active.map(r => ({ row: r, ...counterSlot(r, day) })).filter(s => s.visible);
  const startHour = Math.min(8, ...slots.map(s => Math.floor(s.start / 60)));
  const total = 1440 - startHour * 60;
  const pct = (minute: number) => (minute - startHour * 60) / total * 100;
  const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);
  const minute = now && bangkokDay(now) === day ? (now.getTime() - Date.parse(`${day}T00:00:00+07:00`)) / 60000 : -1;
  const lines = by === 'rooms'
    ? rooms.map(r => ({ id: r.id, title: r.code, sub: r.display_name, lanes: Math.max(1, r.room_positions.filter(p => p.active).length), match: (b: BoardRow) => b.roomId === r.id, lane: (b: BoardRow) => Math.max(0, r.room_positions.filter(p => p.active).findIndex(p => p.id === b.positionId)) }))
    : therapists.map(p => ({ id: p.id, title: p.display_name, sub: '', lanes: 1, match: (b: BoardRow) => b.therapistId === p.id, lane: () => 0 }));
  const current = active.filter(r => r.status === 'in_treatment').length;
  const button = 'min-h-12 rounded-xl border border-line bg-surface px-4 text-sm font-medium active:bg-surface-muted';
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (root.current?.requestFullscreen) await root.current.requestFullscreen(); else setNotice(th ? 'อุปกรณ์นี้ไม่รองรับเต็มจอ ใช้เพิ่มไปยังหน้าจอโฮมได้' : 'Fullscreen unavailable. Add this page to your home screen.'); }
    catch { setNotice(th ? 'เปิดเต็มจอไม่ได้บนอุปกรณ์นี้' : 'Fullscreen unavailable on this device.'); }
  }
  return <main ref={root} className="min-h-dvh bg-surface-muted p-4 text-ink sm:p-6" data-testid="counter-display">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">{brand} · {th ? 'เคาน์เตอร์' : 'RECEPTION'}</p><h1 className="mt-1 text-2xl sm:text-3xl">{th ? 'ตารางวันนี้' : 'Today’s schedule'}</h1><p className="mt-1 text-sm text-ink-muted">{new Intl.DateTimeFormat(th ? 'th-TH' : 'en-GB', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date(`${day}T12:00:00+07:00`))}</p></div>
      <div className="text-right"><p className="tnum text-4xl font-semibold tracking-tight">{now ? formatTime(now.toISOString()) : '—:—'}</p><p className="text-sm text-ink-muted">{th ? 'เวลาประเทศไทย' : 'Bangkok time'}</p><p role="status" className={`mt-1 text-sm ${live === 'offline' ? 'text-danger' : 'text-primary'}`}>{live === 'live' ? (th ? '● เชื่อมต่อแล้ว' : '● Connected') : live === 'offline' ? (th ? 'ออฟไลน์ — ข้อมูลอาจไม่ล่าสุด' : 'Offline — data may be stale') : (th ? 'กำลังเชื่อมต่อ…' : 'Connecting…')}</p></div>
    </header>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button className={button} aria-pressed={by === 'rooms'} onClick={() => setBy('rooms')}>{t('viewRooms')}</button><button className={button} aria-pressed={by === 'therapists'} onClick={() => setBy('therapists')}>{t('viewTherapists')}</button>
      <label className={`${button} inline-flex items-center gap-2`}><input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)} className="size-5" />{th ? 'แสดงชื่อแขก' : 'Show guest names'}</label>
      <button className={button} onClick={() => router.refresh()}>{th ? 'รีเฟรช' : 'Refresh'}</button><button className={button} onClick={fullscreen}>{full ? (th ? 'ออกจากเต็มจอ' : 'Exit fullscreen') : (th ? 'เต็มจอ' : 'Fullscreen')}</button>
      <Link href="/calendar?view=timeline" className={`${button} inline-flex items-center`}>{th ? 'จัดการการจอง ↗' : 'Manage bookings ↗'}</Link>
      <p className="ml-auto text-sm text-ink-muted">{active.length} {th ? 'รายการ' : 'bookings'} · {current} {th ? 'กำลังให้บริการ' : 'in treatment'}</p>
    </div>
    {notice && <p role="status" className="mb-3 text-sm">{notice}</p>}
    <section aria-label={th ? 'ตารางการจองรายวัน' : 'Daily booking timetable'} className="overflow-auto rounded-2xl border border-line bg-surface shadow-sm">
      <div className="min-w-[960px]">
        <div className="flex border-b border-line"><div className="sticky left-0 z-20 w-36 shrink-0 bg-surface p-4 text-sm font-medium">{by === 'rooms' ? t('viewRooms') : t('viewTherapists')}</div><div className="relative h-14 flex-1">{hours.map(h => <span key={h} className="tnum absolute top-4 text-xs text-ink-muted" style={{ left: `${pct(h * 60)}%` }}>{String(h).padStart(2, '0')}:00</span>)}</div></div>
        {lines.map(line => <div key={line.id} className="flex border-b border-line last:border-0" data-testid="counter-row">
          <div className="sticky left-0 z-10 flex w-36 shrink-0 flex-col justify-center border-r border-line bg-surface p-4"><strong className="break-words text-lg">{line.title}</strong><span className="text-xs text-ink-muted">{line.sub}</span></div>
          <div className="relative flex-1" style={{ height: line.lanes * 90 }}>
            {hours.map(h => <div key={h} className="absolute inset-y-0 border-l border-line/60" style={{ left: `${pct(h * 60)}%` }} />)}
            {slots.filter(s => line.match(s.row)).map(({ row: r, start, end }) => <div key={r.bookingId} title={`${formatTime(r.startsAt)}–${formatTime(r.endsAt)} · ${t(`status.${r.status}`)}`} className="absolute overflow-hidden rounded-lg border border-line px-2 py-1.5 text-xs text-ink" style={{ left: `${pct(start)}%`, width: `${(end - start) / total * 100}%`, top: line.lane(r) * 90 + 5, height: 80, backgroundColor: `var(--tint-${r.status.replaceAll('_', '-')})` }}>
              <p className="tnum truncate font-semibold">{formatTime(r.startsAt)}–{formatTime(r.endsAt)}</p><p className="truncate font-medium">{by === 'rooms' ? therapists.find(p => p.id === r.therapistId)?.display_name : rooms.find(p => p.id === r.roomId)?.code}</p><p className="truncate">{t(`status.${r.status}`)}</p>{names && <p className="truncate">{r.customerDisplayName}</p>}
            </div>)}
            {minute >= startHour * 60 && minute < 1440 && <div aria-label={th ? 'เวลาปัจจุบัน' : 'Current time'} className="pointer-events-none absolute inset-y-0 z-[5] w-0.5 bg-danger" style={{ left: `${pct(minute)}%` }} />}
          </div>
        </div>)}
        {lines.length === 0 && <p className="p-8 text-ink-muted">{th ? 'ยังไม่มีรายการให้แสดง' : 'No rows to display'}</p>}
      </div>
    </section>
    <footer className="mt-4 flex flex-wrap gap-4 text-xs text-ink-muted">{(['confirmed', 'checked_in', 'in_treatment', 'completed'] as const).map(s => <span key={s} className={bookingStatusStyle(s).chip}>{t(`status.${s}`)}</span>)}<span className="ml-auto self-center">{th ? 'อัปเดตอัตโนมัติ · เปลี่ยนวันตามเวลาประเทศไทย' : 'Updates automatically · follows the Bangkok date'}</span></footer>
  </main>;
}
