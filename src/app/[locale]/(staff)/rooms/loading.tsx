import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-9 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
