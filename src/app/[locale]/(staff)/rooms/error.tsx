'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function RoomsError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('booking');
  return (
    <div className="flex flex-col items-start gap-3" data-testid="rooms-error">
      <Alert tone="error" className="w-full">{t('loadFailed')}</Alert>
      <Button variant="secondary" onClick={reset}>{t('retry')}</Button>
    </div>
  );
}
