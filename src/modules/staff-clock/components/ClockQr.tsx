'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import qrcode from 'qrcode-generator';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { issueClockCode } from '../actions';

export function ClockQr() {
  const locale = useLocale();
  const t = useTranslations('staffClock');
  const [qr, setQr] = useState<{ image: string; expiresAt: string }>();
  const [failed, setFailed] = useState(false);
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'Asia/Bangkok' });

  useEffect(() => {
    let active = true;
    let timer: number;
    let expiry: number;

    async function refresh() {
      try {
        const code = await issueClockCode();
        if (!active) return;
        if (!code.ok) throw new Error(code.code);
        const url = new URL(`/${locale}/clock`, window.location.origin);
        url.searchParams.set('code', code.id);
        const image = qrcode(0, 'M');
        image.addData(url.toString());
        image.make();
        setFailed(false);
        setQr({ image: image.createDataURL(8), expiresAt: code.expiresAt });
        window.clearTimeout(expiry);
        expiry = window.setTimeout(() => setQr(undefined), Math.max(0, Date.parse(code.expiresAt) - Date.now()));
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) timer = window.setTimeout(refresh, 30000);
      }
    }

    void refresh();
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearTimeout(expiry);
    };
  }, [locale]);

  return (
    <Card className="flex max-w-lg flex-col items-center gap-4 p-6 text-center">
      <p className="text-body text-ink-muted">{t('qrIntro')}</p>
      {qr && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a QR data URL rendered locally */}
          <img src={qr.image} alt={t('qrTitle')} className="aspect-square w-full max-w-80 bg-white [image-rendering:pixelated]" />
          <p className="text-caption text-ink-muted">{t('qrExpiry', { time: time.format(new Date(qr.expiresAt)) })}</p>
        </>
      )}
      {failed && <Alert tone="error">{t('qrFailed')}</Alert>}
      {!qr && !failed && <p role="status">{t('qrLoading')}</p>}
    </Card>
  );
}
