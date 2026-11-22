import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { addDays, bangkokDay, formatTime, parseRange } from '@/lib/time';
import type { ReviewRequest, StaffRequest } from '../model';
import { RequestButtons } from './RequestButtons';

export const REQUEST_PAGE_SIZE = 30;

export function requestPage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page < 1000000 ? page : 1;
}

export async function RequestList({ rows, pathname, query, page, more }: {
  rows: (StaffRequest | ReviewRequest)[];
  pathname: '/staff/requests' | '/admin/staff-requests';
  query: Record<string, string>;
  page: number;
  more: boolean;
}) {
  const [locale, t, roles] = await Promise.all([getLocale(), getTranslations('staffRequests'), getTranslations('staff.roles')]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
  const displayDay = (value: string) => date.format(new Date(`${value}T12:00:00+07:00`));
  const review = pathname === '/admin/staff-requests';

  return (
    <div className="grid gap-2">
      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map((row) => {
            const { start, end } = parseRange(row.during);
            const firstDay = bangkokDay(start);
            const lastDay = row.kind === 'sick' ? addDays(bangkokDay(end), -1) : bangkokDay(end);
            const endLabel = firstDay === lastDay ? '' : displayDay(lastDay);
            const period = row.kind === 'sick'
              ? (endLabel ? `${displayDay(firstDay)} – ${endLabel}` : displayDay(firstDay))
              : `${displayDay(firstDay)} ${formatTime(start)} – ${endLabel ? endLabel + ' ' : ''}${formatTime(end)}`;
            return (
              <li key={row.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{t(`kind.${row.kind}`)}</strong>
                      <Badge>{t(`status.${row.status}`)}</Badge>
                    </div>
                    {'staff' in row && <p className="mt-1 break-words text-body">{row.staff.display_name} · {roles(row.staff.role)}</p>}
                    <p className="text-body text-ink-muted">{period}</p>
                    {review && row.affected_bookings > 0 && (
                      <Link className="text-caption underline" href="/today">{t('affected', { count: row.affected_bookings })}</Link>
                    )}
                  </div>
                  {row.status === 'pending' && <RequestButtons id={row.id} review={review} />}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-body text-ink-muted">{t('empty')}</p>}
      {(page > 1 || more) && (
        <div className="flex gap-4 text-body underline">
          {page > 1 && <Link href={{ pathname, query: { ...query, page: page - 1 } }}>{t('previous')}</Link>}
          {more && <Link href={{ pathname, query: { ...query, page: page + 1 } }}>{t('next')}</Link>}
        </div>
      )}
    </div>
  );
}
