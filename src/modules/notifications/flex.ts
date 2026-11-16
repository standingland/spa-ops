import { bangkokDay, formatTime } from '@/lib/time';

/** A discreet confirmation: treatment and therapist details stay on the booking page. */
export function bookingConfirmationFlex(startsAt: string, senderName: string, cancelUrl?: string) {
  const [year, month, day] = bangkokDay(startsAt).split('-');
  return {
    type: 'flex' as const,
    altText: `${senderName}: ยืนยันนัดหมาย ${day}/${month}/${year} ${formatTime(startsAt)} น.`.slice(0, 400),
    contents: {
      type: 'bubble' as const,
      header: { type: 'box', layout: 'vertical', backgroundColor: '#263C35', contents: [
        { type: 'text', text: senderName, color: '#FFFFFF', size: 'sm', weight: 'bold', wrap: true },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
        { type: 'text', text: 'ยืนยันการนัดหมายแล้ว', weight: 'bold', size: 'xl', color: '#263C35', wrap: true },
        { type: 'text', text: 'ขอบคุณที่จองกับเรา', size: 'sm', color: '#69756F', wrap: true },
        { type: 'separator', margin: 'lg' },
        { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg', contents: [
          { type: 'text', text: `วันที่  ${day}/${month}/${year}`, size: 'md', color: '#263C35', wrap: true },
          { type: 'text', text: `เวลา  ${formatTime(startsAt)} น.`, size: 'md', color: '#263C35', wrap: true },
          { type: 'text', text: 'เวลาประเทศไทย', size: 'xs', color: '#69756F' },
        ] },
      ] },
      ...(cancelUrl ? { footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', style: 'secondary', action: { type: 'uri', label: 'จัดการ / ยกเลิกนัดหมาย', uri: cancelUrl } },
      ] } } : {}),
    },
  };
}
export type BookingConfirmationFlex = ReturnType<typeof bookingConfirmationFlex>;
