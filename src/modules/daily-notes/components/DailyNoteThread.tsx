'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorText } from '@/components/ErrorText';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { replyToDailyNote } from '../actions';
import { MAX_REPLY_LENGTH, type DailyNoteReply } from '../schema';
import styles from '../daily-notes.module.css';

export function DailyNoteThread({ noteId, replies }: { noteId: string; replies: DailyNoteReply[] }) {
  const t = useTranslations('dailyNotes.discussion');
  const te = useTranslations();
  const inputId = useId();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const trimmed = body.trim();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !trimmed) return;

    setError('');
    setSent(false);
    startTransition(async () => {
      try {
        const result = await replyToDailyNote({ noteId, body: trimmed });
        if (!result.ok) {
          setError(errorText(te(uiErrorKey(result.code)), result));
          return;
        }
        setBody('');
        setSent(true);
      } catch {
        setError(te('common.failed'));
      }
    });
  }

  return (
    <details className={styles.thread}>
      <summary>{t('toggle', { count: replies.length })}</summary>
      {replies.length > 0 && (
        <ol className={styles.replies}>
          {replies.map((reply) => (
            <li key={reply.id}>
              <div className={styles.stickyMeta}>
                <strong>{reply.authorName}</strong>
                <span aria-hidden="true">·</span>
                <time dateTime={reply.createdAt}>{formatTime(reply.createdAt)}</time>
              </div>
              <p className={styles.stickyBody}>{reply.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form className={styles.replyForm} onSubmit={submit}>
        <label htmlFor={inputId}>{t('replyLabel')}</label>
        <textarea
          id={inputId}
          className={styles.textarea}
          name="body"
          rows={2}
          value={body}
          maxLength={MAX_REPLY_LENGTH}
          onChange={(event) => {
            setBody(event.target.value);
            setSent(false);
          }}
          readOnly={isPending}
        />
        {error && <div className={styles.error} role="alert"><ErrorText text={error} /></div>}
        <div className={styles.replyActions}>
          <button type="submit" className={styles.postBtn} disabled={!trimmed || isPending}>
            {isPending ? t('sending') : t('send')}
          </button>
          {sent && <span className={styles.hint} role="status">{t('sent')}</span>}
        </div>
      </form>
    </details>
  );
}
