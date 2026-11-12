/** The Content-Security-Policy for pages, with a per-request nonce (Next.js nonce guide). */
export function buildCsp(nonce: string, supabaseUrl: string, dev: boolean): string {
  let connect = "'self'";
  let img = "'self' blob: data:";
  try {
    const u = new URL(supabaseUrl);
    const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
    connect += ` ${u.origin} ${ws}//${u.host}`;
    img += ` ${u.origin}`;   // private therapist photos are served from Supabase Storage by short-lived signed links
  } catch { /* an invalid URL is reported by parseEnv at start */ }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",   // React style={{…}} attributes (calendar positions); scripts stay nonce-only
    `img-src ${img}`,
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Policy for API responses: they return data, never documents. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
