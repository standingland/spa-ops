'use client';

/** Last resort when even the layout fails. Both languages, no dependencies, nothing logged in the browser. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="th">
      <body style={{ fontFamily: 'sans-serif', padding: '3rem 1rem', textAlign: 'center' }}>
        <h1>เกิดข้อผิดพลาด / Something went wrong</h1>
        <p>กรุณาโหลดหน้าใหม่ หากยังเป็นอยู่ให้แจ้งผู้จัดการ / Please reload; if it continues, tell your manager.</p>
        <button onClick={reset} style={{ padding: '0.5rem 1rem' }}>โหลดใหม่ / Reload</button>
      </body>
    </html>
  );
}
