'use client';

import { useTranslations } from 'next-intl';

export default function PaymentsError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('booking');
  return (
    <div className="flex flex-col items-start gap-2" data-testid="payments-error">
      <p role="alert" className="text-clay">{t('loadFailed')}</p>
      <button className="underline" onClick={reset}>{t('retry')}</button>
    </div>
  );
}
