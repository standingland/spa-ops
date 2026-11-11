import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

export async function proxy(original: NextRequest) {
  // A fresh nonce per request: Next.js reads the policy from the request headers and stamps its own scripts with it.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NODE_ENV === 'development');
  const headers = new Headers(original.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const request = new NextRequest(original, { headers });

  const response = intl(request);
  response.headers.set('Content-Security-Policy', csp);
  // Refresh the Supabase session cookies on every page request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ['/((?!api|_next|_vercel|.*\..*).*)'] };
