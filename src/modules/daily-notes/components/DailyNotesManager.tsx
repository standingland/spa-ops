'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useLiveRefresh } from '@/lib/realtime';
import { Icon } from '@/components/shell/Icon';
import { ErrorText } from '@/components/ErrorText';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { postDailyNote, removeDailyNote } from '../actions';
import { MAX_NOTE_LENGTH, NOTE_TONES, type DailyNote, type DailyNoteReply, type NoteTone } from '../schema';
import { DailyNoteThread } from './DailyNoteThread';
import styles from '../daily-notes.module.css';

const LIVE_TABLES = ['staff_daily_notes', 'staff_daily_note_replies'];

function DiscussionLiveUpdates() {
  useLiveRefresh(LIVE_TABLES);
  return null;
}

export function DailyNotesManager({
  notes,
  canPost,
  discussion,
}: {
  notes: DailyNote[] | null;
  canPost: boolean;
  discussion?: Record<string, DailyNoteReply[]> | null;
}) {
  const t = useTranslations('dailyNotes');
  const te = useTranslations();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [tone, setTone] = useState<NoteTone>('note');
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = body.trim();
  const canSubmit = canPost && trimmed.length > 0 && trimmed.length <= MAX_NOTE_LENGTH && !isPending;
  const isStaffBoard = discussion !== undefined;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await postDailyNote({ body: trimmed, tone });
      if (!res.ok) {
        setError(errorText(te(uiErrorKey(res.code)), res));
        return;
      }
      setBody('');
      setTone('note');
      router.refresh();
    });
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  function handleRemove(id: string) {
    if (!canPost || removingId) return;
    setError(null);
    setRemovingId(id);
    startTransition(async () => {
      const res = await removeDailyNote(id);
      setRemovingId(null);
      if (!res.ok) {
        setError(errorText(te(uiErrorKey(res.code)), res));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section
      className={styles.board}
      aria-labelledby="staff-daily-notes-title"
      data-testid={isStaffBoard ? 'staff-daily-notes' : 'admin-daily-notes'}
    >
      {isStaffBoard && <DiscussionLiveUpdates />}
      <div className={styles.boardHead}>
        <div className={styles.headCopy}>
          <h2 id="staff-daily-notes-title">{t('title')}</h2>
          <p>{isStaffBoard ? t('discussion.subtitle') : t(canPost ? 'subtitleOwner' : 'subtitleReadOnly')}</p>
        </div>
        <div className={styles.headMeta}>
          {notes && <span>{t('count', { count: notes.length })}</span>}
          {!isStaffBoard && <Link href="/today">{t('viewOnToday')}</Link>}
        </div>
      </div>

      <div className={styles.body}>
        {canPost && (
          <form className={styles.composer} data-tone={tone} onSubmit={handleFormSubmit} data-testid="daily-note-form">
            <div className={styles.composerTop}>
              <div className={styles.tones} role="radiogroup" aria-label={t('toneLabel')}>
                {NOTE_TONES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={tone === option}
                    className={styles.toneBtn}
                    data-testid={`daily-note-tone-${option}`}
                    onClick={() => setTone(option)}
                  >
                    <span className={styles.toneDot} data-tone={option} aria-hidden="true" />
                    {t(`tone.${option}`)}
                  </button>
                ))}
              </div>
              <span className={styles.charCount} aria-live="polite">
                {body.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>

            <textarea
              className={styles.textarea}
              name="body"
              value={body}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={t(`placeholder.${tone}`)}
              aria-label={t('inputLabel')}
              data-testid="daily-note-input"
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isPending}
            />

            <div className={styles.composerFoot}>
              <span className={styles.hint}>{t('visibilityHint')}</span>
              <button
                type="submit"
                className={styles.postBtn}
                disabled={!canSubmit}
                data-testid="daily-note-submit"
              >
                {isPending && !removingId ? t('posting') : t('post')}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className={styles.error} role="alert" data-testid="daily-note-error">
            <ErrorText text={error} />
          </div>
        )}

        {notes === null ? (
          <p className={styles.empty} role="status">{t('discussion.notesUnavailable')}</p>
        ) : notes.length === 0 ? (
          <p className={styles.empty} data-testid="daily-notes-empty">
            {canPost ? t('emptyOwner') : t('emptyStaff')}
          </p>
        ) : (
          <div className={isStaffBoard ? styles.threads : styles.grid} data-testid="daily-notes-list">
            {discussion === null && <p className={styles.empty} role="status">{t('discussion.repliesUnavailable')}</p>}
            {notes.map((note) => (
              <article
                key={note.id}
                className={styles.sticky}
                data-tone={note.tone}
                data-testid="daily-note-card"
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
                  {canPost && (
                    <button
                      type="button"
                      className={styles.removeBtn}
                      aria-label={t('remove')}
                      title={t('remove')}
                      data-testid="daily-note-remove"
                      disabled={removingId === note.id}
                      onClick={() => handleRemove(note.id)}
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>
                <p className={styles.stickyBody}>{note.body}</p>
                {discussion && <DailyNoteThread noteId={note.id} replies={discussion[note.id] ?? []} />}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
