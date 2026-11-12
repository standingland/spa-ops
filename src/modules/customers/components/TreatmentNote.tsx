'use client';

import { useEffect, useState } from 'react';
import { getBookingDetail } from '../actions';

/** The treatment notes for one booking (booking note and the customer's treatment preferences); never contact details. */
export function TreatmentNote({ bookingId }: { bookingId: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let live = true;
    void getBookingDetail(bookingId).then((r) => {
      if (live && r.ok) setText([r.serviceNotes, r.note].filter(Boolean).join(' · '));
    });
    return () => { live = false; };
  }, [bookingId]);
  if (!text) return null;
  return <span data-testid="treatment-note" className="w-full min-w-0 break-words text-caption italic text-ink-muted">{text}</span>;
}
