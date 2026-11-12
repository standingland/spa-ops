import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const variants = cva('rounded-[var(--radius)] border p-3 text-body', {
  variants: {
    tone: {
      error: 'border-danger bg-surface text-danger',
      info: 'border-line bg-surface-muted text-ink',
    },
  },
  defaultVariants: { tone: 'info' },
});

type AlertProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof variants>;

export function Alert({ tone, className, ...props }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(variants({ tone }), className)}
      {...props}
    />
  );
}
