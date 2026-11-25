'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { listDailyNotes } from '../actions';
import { consumeDailyNotesPopup } from '../loginPopup';
import type { DailyNote } from '../schema';
import { DailyNotesStrip } from './DailyNotesStrip';
import styles from '../daily-notes.module.css';

export function DailyNotesLoginPopup({ userId }: { userId: string }) {
  const t = useTranslations('dailyNotes');
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [notes, setNotes] = useState<DailyNote[]>([]);

  useEffect(() => {
    if (!consumeDailyNotesPopup(userId)) return;

    async function loadNotes() {
      try {
        const result = await listDailyNotes();
        if (result.ok) setNotes(result.notes);
      } catch {
        // A failed note request should leave the workspace usable.
      }
    }

    void loadNotes();
  }, [userId]);

  useEffect(() => {
    if (notes.length > 0 && !dialog.current?.open) dialog.current?.showModal();
  }, [notes.length]);

  if (notes.length === 0) return null;

  return (
    <dialog ref={dialog} aria-labelledby={titleId} className={styles.loginDialog} onClose={() => setNotes([])}>
      <DailyNotesStrip notes={notes} titleId={titleId} />
      <form method="dialog" className={styles.loginDialogActions}>
        <Button>{t('dismiss')}</Button>
      </form>
    </dialog>
  );
}
