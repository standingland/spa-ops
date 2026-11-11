'use client';

import { useState } from 'react';
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
  if (rows.length === 0) return <p className="text-sm text-stone-dark">{t('nonePending')}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.bookingId} data-testid="pending-payment-row" className="flex flex-col gap-2 rounded border border-stone bg-white p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="tnum text-sm">{formatTime(r.startsAt)}</span>
            {!shared && <span>{r.customerDisplayName}</span>}
            {r.dueSatang > 0
              ? <span data-testid="due-amount" className="tnum font-semibold">{formatTHB(r.dueSatang)}</span>
              : <span data-testid="refund-owed" className="tnum font-semibold text-clay">{t('refundOwed')} {formatTHB(-r.dueSatang)}</span>}
            <span className="rounded bg-ivory px-2 py-0.5 text-xs">{t(`status.${r.paymentStatus}`)}</span>
            {r.dueSatang > 0 && canRecord && methods.length > 0 && open !== r.bookingId && (
              <button data-testid="pay-open" onClick={() => setOpen(r.bookingId)} className="ml-auto rounded border border-charcoal px-3 py-1.5 text-sm">{t('pay')}</button>
            )}
          </div>
          {open === r.bookingId && (
            <PaymentDialog bookingId={r.bookingId} dueSatang={r.dueSatang} methods={methods}
              onClose={() => setOpen(null)} onDone={() => { setOpen(null); router.refresh(); }} />
          )}
        </li>
      ))}
    </ul>
  );
}
