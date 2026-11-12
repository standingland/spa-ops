import type { ReactNode } from 'react';

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-line-strong p-6 text-center text-body text-ink-muted">
      {children}
    </div>
  );
}
