import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';
import { normalizeSupabaseKey, normalizeSupabaseUrl } from './lib/supabase/mock';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

export async function proxy(original: NextRequest) {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = normalizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_KEY);
  // A fresh nonce per request: Next.js reads the policy from the request headers and stamps its own scripts with it.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, supabaseUrl ?? '', process.env.NODE_ENV === 'development');
  const headers = new Headers(original.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const request = new NextRequest(original, { headers });

  const response = intl(request);
  response.headers.set('Content-Security-Policy', csp);
  // The public landing and careers pages do not need a staff session or a database connection.
  if (/^\/(?:(?:th|en)\/?)?(?:careers\/?)?$/.test(request.nextUrl.pathname)) return response;
  if (!supabaseUrl || !supabaseKey) return response;
  const isHttps = request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';
  // Refresh the Supabase session cookies on every page request.
  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, isHttps ? { ...options, sameSite: 'none', secure: true } : options),
          ),
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

// Every page request except API routes, framework files and anything with a file extension (\\. is a literal dot).
export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
