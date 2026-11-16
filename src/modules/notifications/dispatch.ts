import { renderTemplate, type TemplateKey } from './templates';
import { bookingConfirmationFlex, type BookingConfirmationFlex } from './flex';

export type OutboxRow = { id: string; customer_id: string; template: TemplateKey; payload: { booking_id: string; starts_at: string } };

export interface OutboxPort {
  claim(limit: number): Promise<OutboxRow[]>;
  contact(customerId: string): Promise<{ phone: string | null; email: string | null; lineUserId?: string | null }>;
  complete(id: string, ok: boolean, error?: string): Promise<void>;
  /** A link the guest can use to cancel this booking, for bookings made on the public page; null for every other booking. */
  cancelUrl?(bookingId: string, startsAt: string): Promise<string | null>;
}
export interface Sender { send(m: { channel: 'sms' | 'email' | 'line'; to: string; text: string; flex?: BookingConfirmationFlex }): Promise<void> }

/**
 * Sends what the outbox hands over. One failing message never stops the rest; every outcome is recorded,
 * so a crash between claim and complete simply makes the message claimable again after the visibility timeout.
 * A customer reachable on LINE is messaged there first, then by sms, then by email.
 */
export async function dispatchPending(port: OutboxPort, sender: Sender, opts: { senderName: string; limit?: number }): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const row of await port.claim(opts.limit ?? 20)) {
    try {
      const c = await port.contact(row.customer_id);
      const channel = c.lineUserId ? 'line' : c.phone ? 'sms' : c.email ? 'email' : null;
      if (!channel) { await port.complete(row.id, false, 'NO_CONTACT'); failed++; continue; }
      const to = channel === 'line' ? c.lineUserId! : channel === 'sms' ? c.phone! : c.email!;
      const cancelUrl = row.template === 'booking_confirmed' && port.cancelUrl ? await port.cancelUrl(row.payload.booking_id, row.payload.starts_at) : null;
      await sender.send({ channel, to, text: renderTemplate(row.template, row.payload, 'th', opts.senderName, cancelUrl ? { cancelUrl } : undefined),
        ...(channel === 'line' && row.template === 'booking_confirmed' ? { flex: bookingConfirmationFlex(row.payload.starts_at, opts.senderName, cancelUrl ?? undefined) } : {}),
      });
      await port.complete(row.id, true);
      sent++;
    } catch (e) {
      failed++;
      try { await port.complete(row.id, false, e instanceof Error ? e.message : String(e)); } catch { /* the claim timeout will bring it back */ }
    }
  }
  return { sent, failed };
}
