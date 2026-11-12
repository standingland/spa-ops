'use client';

// global-error replaces the root layout, so it loads the stylesheet itself (a linked file, CSP-safe).
import './globals.css';

/** Last resort when even the layout fails. Both languages, no dependencies, nothing logged in the browser. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-surface-muted px-4 py-12 text-center text-ink">
        <main className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[var(--radius)] border border-line bg-surface p-6">
          <h1 className="text-heading">เกิดข้อผิดพลาด / Something went wrong</h1>
          <p className="text-body text-ink-muted">กรุณาโหลดหน้าใหม่ หากยังเป็นอยู่ให้แจ้งผู้จัดการ / Please reload; if it continues, tell your manager.</p>
          <button
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] bg-primary px-4 text-body font-medium text-primary-foreground"
          >
            โหลดใหม่ / Reload
          </button>
        </main>
      </body>
    </html>
  );
}
