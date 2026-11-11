'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/browser';

export type LiveState = 'live' | 'offline' | 'idle';

// One shared state so the header indicator can show what the screen below is doing.
let current: LiveState = 'idle';
const listeners = new Set<() => void>();
function setLive(s: LiveState) {
  if (current === s) return;
  current = s;
  listeners.forEach((l) => l());
}
export function useLiveState(): LiveState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => 'idle' as LiveState);
}

const POLL_MS = Number(process.env.NEXT_PUBLIC_LIVE_POLL_MS ?? 60000);

/**
 * Subscribes to Postgres changes on `tables` and refetches the page's server data when anything changes
 * (debounced 300 ms). Events are never rendered: they only trigger a refetch through role-checked server code.
 * A timer refreshes independently, so a dropped connection is caught up by polling. Returns 'offline' while the
 * channel is not subscribed or the browser reports offline.
 */
export function useLiveRefresh(tables: readonly string[]): LiveState {
  const router = useRouter();
  const key = tables.join(',');
  const [nonce, setNonce] = useState(0); // bumping it rebuilds the channel after the network returns

  useEffect(() => {
    const supabase = createClient();
    let subscribed = false;
    let online = typeof navigator === 'undefined' ? true : navigator.onLine;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // test hook: a desk that is deliberately kept stale
    const paused = () => Boolean((window as unknown as { __pauseLive?: boolean }).__pauseLive);
    const publish = () => setLive(subscribed && online ? 'live' : 'offline');
    const refresh = () => {
      if (!online || paused()) return;
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase.channel(`live:${key}:${nonce}`);
    for (const table of key.split(',')) channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    channel.subscribe((status) => {
      const was = subscribed;
      subscribed = status === 'SUBSCRIBED';
      publish();
      if (subscribed && !was && nonce > 0) refresh(); // catch up on whatever happened while we were away
    });

    const onOffline = () => { online = false; publish(); };
    const onOnline = () => { online = true; publish(); refresh(); setNonce((n) => n + 1); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    const poll = setInterval(refresh, POLL_MS);
    publish();

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      clearInterval(poll);
      clearTimeout(timer);
      void supabase.removeChannel(channel);
      setLive('idle');
    };
  }, [key, nonce, router]);

  return useLiveState();
}
