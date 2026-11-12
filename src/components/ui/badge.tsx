import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import type { BookingStatus } from '@/modules/booking/schema';
import type { RoomStatus } from '@/modules/operations/today';
import { bookingStatusStyle, roomStatusStyle } from './status';

const variants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-caption', {
  variants: {
    tone: { neutral: 'bg-surface-muted text-ink', warning: 'border border-danger text-danger' },
  },
  defaultVariants: { tone: 'neutral' },
});

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof variants>;

export function Badge({ tone, className, ...props }: BadgeProps) {
  return <span className={cn(variants({ tone }), className)} {...props} />;
}

export function StatusDot({ status, className }: { status: RoomStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 rounded-full', roomStatusStyle(status)?.dot, className)}
    />
  );
}

export function StatusChip({
  kind,
  status,
  label,
}: {
  kind: 'room' | 'booking';
  status: string;
  label: string;
}) {
  // Callers pass valid values; unknown ones fall back to unstyled text.
  const style =
    kind === 'room'
      ? roomStatusStyle(status as RoomStatus)
      : bookingStatusStyle(status as BookingStatus);
  return <span className={style?.chip}>{label}</span>;
}
