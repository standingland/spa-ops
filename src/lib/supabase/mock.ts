import type { SupabaseClient } from '@supabase/supabase-js';

/** Strips whitespace/surrounding quotes and accepts bare *.supabase.co hostnames; returns null if not a valid http(s) URL. */
export function normalizeSupabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v) && /^[a-z0-9-]+\.supabase\.(co|in|net)(\/.*)?$/i.test(v)) {
    v = `https://${v}`;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function normalizeSupabaseKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  return v || null;
}

const NOT_CONFIGURED_ERROR = {
  message: 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_KEY, and SUPABASE_SERVICE_KEY.',
  code: 'SUPABASE_NOT_CONFIGURED',
  details: '',
  hint: '',
  name: 'AuthError',
};

function createQueryBuilder() {
  const result = { data: null, error: NOT_CONFIGURED_ERROR, count: 0, status: 503, statusText: 'Service Unavailable' };
  const builder: Record<string, unknown> = {
    then(onFulfilled?: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  const proxy: unknown = new Proxy(builder, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => proxy;
    },
  });
  return proxy;
}

/** Lightweight no-op Supabase client used only when Supabase env vars are not configured. */
export function createMockSupabaseClient(): SupabaseClient {
  const storageBucket = {
    createSignedUrl: async () => ({ data: null, error: NOT_CONFIGURED_ERROR }),
    createSignedUrls: async () => ({ data: [], error: NOT_CONFIGURED_ERROR }),
    download: async () => ({ data: null, error: NOT_CONFIGURED_ERROR }),
    upload: async () => ({ data: null, error: NOT_CONFIGURED_ERROR }),
    remove: async () => ({ data: null, error: NOT_CONFIGURED_ERROR }),
  };

  const channel = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: async () => 'ok',
  };

  const client = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: NOT_CONFIGURED_ERROR }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: null }, error: NOT_CONFIGURED_ERROR }),
      admin: {
        createUser: async () => ({ data: { user: null }, error: NOT_CONFIGURED_ERROR }),
        updateUserById: async () => ({ data: { user: null }, error: NOT_CONFIGURED_ERROR }),
        listUsers: async () => ({ data: { users: [] }, error: NOT_CONFIGURED_ERROR }),
      },
    },
    from: () => createQueryBuilder(),
    rpc: () => createQueryBuilder(),
    storage: {
      from: () => storageBucket,
    },
    channel: () => channel,
    removeChannel: async () => 'ok',
  };

  return client as unknown as SupabaseClient;
}
