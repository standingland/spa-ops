'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { reportRoomIssue } from '../actions';

export function ReportForm({ roomId, room, onDone, onError }: { roomId: string; room: string; onDone: () => void; onError: (m: string | null) => void }) {
  const t = useTranslations('today');
  const te = useTranslations();
  const router = useRouter();
  const [note, setNote] = useState('');
  return (
    <form className="flex flex-wrap items-end gap-2 rounded border border-stone bg-white p-3 text-sm" aria-label={t('report')}
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await reportRoomIssue({ roomId, note });
        if (!r.ok) { onError(errorText(te(uiErrorKey(r.code)), r)); return; }
        onDone(); router.refresh();
      }}>
      <label className="flex flex-col">{t('report')} · {room}<input required value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('reportNote')} className="rounded border border-stone-dark px-2 py-1" data-testid="report-note" /></label>
      <button type="submit" className="rounded bg-charcoal px-3 py-1.5 text-ivory" data-testid="report-send">{t('send')}</button>
      <button type="button" onClick={onDone} className="underline">×</button>
    </form>
  );
}
