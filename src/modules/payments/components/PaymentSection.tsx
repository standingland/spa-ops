'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { formatTHB } from '@/lib/money';
import { getPaymentPanel } from '../actions';
import type { Money, PaymentMethod } from '../schema';
import { ChargeAdjust } from './ChargeAdjust';
import { PaymentDialog } from './PaymentDialog';

type Panel = { money: Money | null; methods: PaymentMethod[]; canRecord: boolean; canAdjust: boolean };

/** Payment state of one booking inside the booking panel. Rendered for desk roles only. */
export function PaymentSection({ bookingId, version }: { bookingId: string; version: number }) {
  const t = useTranslations('payments');
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    const r = await getPaymentPanel(bookingId);
    if (r.ok) setPanel(r);
  }, [bookingId]);
  useEffect(() => { void load(); }, [load]);

  if (!panel || !panel.money) return null;
  const m = panel.money;
  return (
    <div className="flex flex-col gap-2 border-t border-stone pt-3" data-testid="payment-section">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span data-testid="payment-status" data-status={m.paymentStatus} className="rounded bg-ivory px-2 py-0.5 text-xs">{t(`status.${m.paymentStatus}`)}</span>
        {m.hasUnverified && <span data-testid="payment-unverified" className="rounded bg-brass px-2 py-0.5 text-xs text-white">{t('awaitingVerification')}</span>}
        <span className="tnum">{t('charge')} {formatTHB(m.chargeSatang)}</span>
        <span className="tnum">{t('paid')} {formatTHB(m.paidSatang - m.refundedSatang)}</span>
        {m.dueSatang > 0 && <span data-testid="due-amount" className="tnum font-semibold">{formatTHB(m.dueSatang)}</span>}
        {m.dueSatang < 0 && <span data-testid="refund-owed" className="tnum font-semibold text-clay">{t('refundOwed')} {formatTHB(-m.dueSatang)}</span>}
        {m.dueSatang > 0 && panel.canRecord && panel.methods.length > 0 && !paying && (
          <button data-testid="pay-open" onClick={() => setPaying(true)} className="rounded border border-charcoal px-3 py-1">{t('pay')}</button>
        )}
        {panel.canAdjust && <ChargeAdjust bookingId={bookingId} expectedVersion={version} onDone={() => router.refresh()} />}
      </div>
      {paying && (
        <PaymentDialog bookingId={bookingId} dueSatang={m.dueSatang} methods={panel.methods}
          onClose={() => setPaying(false)} onDone={() => { setPaying(false); void load(); router.refresh(); }} />
      )}
    </div>
  );
}
