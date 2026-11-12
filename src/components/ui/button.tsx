import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const variants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium disabled:opacity-60 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground',
        secondary: 'border border-line-strong bg-surface text-ink',
        danger: 'bg-danger text-white',
        link: 'text-primary underline',
      },
      size: {
        md: 'min-h-11 px-4 text-body',
        sm: 'min-h-11 pointer-fine:min-h-9 px-3 text-caption',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'min-h-0 px-0' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

// twMerge resolves the link variant's padding overrides against the size classes.
export const buttonVariants = (options?: VariantProps<typeof variants>): string =>
  cn(variants(options));

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

// No default `type`: existing forms rely on the native submit default.
export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
