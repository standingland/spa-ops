import { BookingConfirmation } from '@/modules/public/components/BookingConfirmation';

export default async function DonePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return <BookingConfirmation token={token} />;
}
