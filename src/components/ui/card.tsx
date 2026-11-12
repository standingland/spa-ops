import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const variants = cva('rounded-[var(--radius)] border bg-surface p-4', {
  variants: {
    tone: { default: 'border-line', danger: 'border-danger' },
  },
  defaultVariants: { tone: 'default' },
});

type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof variants>;

export function Card({ tone, className, ...props }: CardProps) {
  return <div className={cn(variants({ tone }), className)} {...props} />;
}
