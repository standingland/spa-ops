'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { reportRoomIssue } from '../actions';

export function ReportForm({ roomId, room, onDone, onError }: { roomId: string; room: string; onDone: () => void; onError: (m: string | null) => void }) {
  const t = useTranslations('today');
  const te = useTranslations();
  const router = useRouter();
  const [note, setNote] = useState('');
  return (
    <form className="flex min-w-0 flex-wrap items-end gap-2 rounded-[var(--radius)] border border-line bg-surface p-3 text-body" aria-label={t('report')}
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await reportRoomIssue({ roomId, note });
        if (!r.ok) { onError(errorText(te(uiErrorKey(r.code)), r)); return; }
        onDone(); router.refresh();
      }}>
      <div className="min-w-0 flex-1">
        <Field label={`${t('report')} · ${room}`}>
          <Input required value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('reportNote')} data-testid="report-note" />
        </Field>
      </div>
      <Button type="submit" size="sm" data-testid="report-send">{t('send')}</Button>
      <Button type="button" size="sm" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={onDone}>×</Button>
    </form>
  );
}
