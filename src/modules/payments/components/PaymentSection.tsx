'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void getPaymentPanel(bookingId).then((r) => { if (live && r.ok) setPanel(r); });
    return () => { live = false; };
  }, [bookingId, reload]);

  if (!panel || !panel.money) return null;
  const m = panel.money;
  return (
    <div className="flex flex-col gap-2 min-w-0 border-t border-line pt-3" data-testid="payment-section">
      <div className="flex flex-wrap items-center gap-3 text-body text-ink">
        <Badge data-testid="payment-status" data-status={m.paymentStatus}>{t(`status.${m.paymentStatus}`)}</Badge>
        {m.hasUnverified && <Badge data-testid="payment-unverified" className="bg-tint-reserved">{t('awaitingVerification')}</Badge>}
        <span className="tnum">{t('charge')} {formatTHB(m.chargeSatang)}</span>
        <span className="tnum">{t('paid')} {formatTHB(m.paidSatang - m.refundedSatang)}</span>
        {m.dueSatang > 0 && <span data-testid="due-amount" className="tnum font-semibold">{formatTHB(m.dueSatang)}</span>}
        {m.dueSatang < 0 && <span data-testid="refund-owed" className="tnum font-semibold text-danger">{t('refundOwed')} {formatTHB(-m.dueSatang)}</span>}
        {m.dueSatang > 0 && panel.canRecord && panel.methods.length > 0 && !paying && (
          <Button variant="secondary" size="sm" data-testid="pay-open" onClick={() => setPaying(true)}>{t('pay')}</Button>
        )}
        {panel.canAdjust && <ChargeAdjust bookingId={bookingId} expectedVersion={version} onDone={() => router.refresh()} />}
      </div>
      {paying && (
        <PaymentDialog bookingId={bookingId} dueSatang={m.dueSatang} methods={panel.methods}
          onClose={() => setPaying(false)} onDone={() => { setPaying(false); setReload((n) => n + 1); router.refresh(); }} />
      )}
    </div>
  );
}
