import { renderTemplate, type TemplateKey } from './templates';

export type OutboxRow = { id: string; customer_id: string; template: TemplateKey; payload: { booking_id: string; starts_at: string } };

export interface OutboxPort {
  claim(limit: number): Promise<OutboxRow[]>;
  contact(customerId: string): Promise<{ phone: string | null; email: string | null }>;
  complete(id: string, ok: boolean, error?: string): Promise<void>;
}
export interface Sender { send(m: { channel: 'sms' | 'email'; to: string; text: string }): Promise<void> }

/**
 * Sends what the outbox hands over. One failing message never stops the rest; every outcome is recorded,
 * so a crash between claim and complete simply makes the message claimable again after the visibility timeout.
 */
export async function dispatchPending(port: OutboxPort, sender: Sender, opts: { senderName: string; limit?: number }): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const row of await port.claim(opts.limit ?? 20)) {
    try {
      const c = await port.contact(row.customer_id);
      const channel = c.phone ? 'sms' : c.email ? 'email' : null;
      if (!channel) { await port.complete(row.id, false, 'NO_CONTACT'); failed++; continue; }
      await sender.send({ channel, to: (channel === 'sms' ? c.phone : c.email)!, text: renderTemplate(row.template, row.payload, 'th', opts.senderName) });
      await port.complete(row.id, true);
      sent++;
    } catch (e) {
      failed++;
      try { await port.complete(row.id, false, e instanceof Error ? e.message : String(e)); } catch { /* the claim timeout will bring it back */ }
    }
  }
  return { sent, failed };
}
