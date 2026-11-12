'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * While `open`, Escape calls `onClose`. When `open` turns false, focus goes back to `returnTo`
 * (or to the element that was focused when the panel opened).
 */
export function usePanelBehavior(open: boolean, onClose: () => void, returnTo?: RefObject<HTMLElement | null>): void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    if (open && !wasOpen.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!open && wasOpen.current) (returnTo?.current ?? opener.current)?.focus();
    wasOpen.current = open;
  }, [open, returnTo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
}
