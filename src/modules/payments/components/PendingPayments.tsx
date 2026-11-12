'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { formatTime } from '@/lib/time';
import { formatTHB } from '@/lib/money';
import type { PaymentMethod, PendingPayment } from '../schema';
import { PaymentDialog } from './PaymentDialog';

/** Finished, cancelled and no-show bookings that still owe money (or are owed a refund). Desk roles only. */
export function PendingPayments({ rows, methods, canRecord, shared }: {
  rows: PendingPayment[]; methods: PaymentMethod[]; canRecord: boolean; shared: boolean;
}) {
  const t = useTranslations('payments');
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <EmptyState>{t('nonePending')}</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.bookingId} data-testid="pending-payment-row" className="min-w-0">
          <Card className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="tnum text-body text-ink">{formatTime(r.startsAt)}</span>
            {!shared && <span className="min-w-0 break-words text-body text-ink">{r.customerDisplayName}</span>}
            {r.dueSatang > 0
              ? <span data-testid="due-amount" className="tnum font-semibold">{formatTHB(r.dueSatang)}</span>
              : <span data-testid="refund-owed" className="tnum font-semibold text-danger">{t('refundOwed')} {formatTHB(-r.dueSatang)}</span>}
            <Badge>{t(`status.${r.paymentStatus}`)}</Badge>
            {r.dueSatang > 0 && canRecord && methods.length > 0 && open !== r.bookingId && (
              <Button variant="secondary" size="sm" className="ml-auto" data-testid="pay-open" onClick={() => setOpen(r.bookingId)}>{t('pay')}</Button>
            )}
          </div>
          {open === r.bookingId && (
            <PaymentDialog bookingId={r.bookingId} dueSatang={r.dueSatang} methods={methods}
              onClose={() => setOpen(null)} onDone={() => { setOpen(null); router.refresh(); }} />
          )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
