'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Icon } from '@/components/shell/Icon';
import { ErrorText } from '@/components/ErrorText';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { postDailyNote, removeDailyNote } from '../actions';
import { MAX_NOTE_LENGTH, NOTE_TONES, type DailyNote, type NoteTone } from '../schema';
import styles from '../daily-notes.module.css';

export function DailyNotesManager({
  initialNotes,
  canPost,
}: {
  initialNotes: DailyNote[];
  canPost: boolean;
}) {
  const t = useTranslations('dailyNotes');
  const te = useTranslations();
  const router = useRouter();
  const [notes, setNotes] = useState<DailyNote[]>(initialNotes);
  const [body, setBody] = useState('');
  const [tone, setTone] = useState<NoteTone>('note');
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = body.trim();
  const canSubmit = canPost && trimmed.length > 0 && trimmed.length <= MAX_NOTE_LENGTH && !isPending;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await postDailyNote({ body: trimmed, tone });
      if (!res.ok) {
        setError(errorText(te(uiErrorKey(res.code)), res));
        return;
      }
      setNotes((prev) => [res.note, ...prev.filter((n) => n.id !== res.note.id)]);
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
      setNotes((prev) => prev.filter((n) => n.id !== id));
      router.refresh();
    });
  }

  return (
    <section className={styles.board} aria-labelledby="staff-daily-notes-title" data-testid="admin-daily-notes">
      <div className={styles.boardHead}>
        <div className={styles.headCopy}>
          <h2 id="staff-daily-notes-title">{t('title')}</h2>
          <p>{canPost ? t('subtitleOwner') : t('subtitleReadOnly')}</p>
        </div>
        <div className={styles.headMeta}>
          <span>{t('count', { count: notes.length })}</span>
          <Link href="/today">{t('viewOnToday')}</Link>
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

        {notes.length === 0 ? (
          <p className={styles.empty} data-testid="daily-notes-empty">
            {canPost ? t('emptyOwner') : t('emptyStaff')}
          </p>
        ) : (
          <div className={styles.grid} data-testid="daily-notes-list">
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
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
