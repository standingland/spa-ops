'use client';

import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/time';
import type { DailyNote } from '../schema';
import styles from '../daily-notes.module.css';

/**
 * Sticky-note daily updates posted by owners, visible to all active staff members
 * at the top of their daily view (/today). Renders nothing when no notes are active.
 */
export function DailyNotesStrip({ notes }: { notes: DailyNote[] }) {
  const t = useTranslations('dailyNotes');
  if (notes.length === 0) return null;

  return (
    <section
      className={styles.strip}
      aria-labelledby="today-daily-notes-title"
      data-testid="today-daily-notes"
    >
      <div className={styles.stripHead}>
        <h2 id="today-daily-notes-title" className={styles.stripTitle}>
          {t('title')}
        </h2>
        <span className={styles.stripSub}>{t('count', { count: notes.length })}</span>
      </div>

      <div className={styles.grid}>
        {notes.map((note) => (
          <article
            key={note.id}
            className={styles.sticky}
            data-tone={note.tone}
            data-testid="today-daily-note-card"
            role={note.tone === 'alert' ? 'status' : undefined}
          >
            <div className={styles.stickyTop}>
              <div className={styles.stickyMeta}>
                <span className={styles.toneLabel}>{t(`tone.${note.tone}`)}</span>
                <span aria-hidden="true">·</span>
                <time className={styles.stickyTime} dateTime={note.createdAt}>
                  {formatTime(note.createdAt)}
                </time>
                <span aria-hidden="true">·</span>
                <span>{note.authorName}</span>
              </div>
            </div>
            <p className={styles.stickyBody}>{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
