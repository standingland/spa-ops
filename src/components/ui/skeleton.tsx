import { cn } from '@/lib/cn';

/** Decorative placeholder block for loading states; carries no text and is hidden from assistive technology. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-[var(--radius)] bg-line/60 motion-reduce:animate-none', className)}
    />
  );
}
