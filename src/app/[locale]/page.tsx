import { redirect } from '@/i18n/navigation';

// The bare locale address (/th, /en) has no page of its own: send people to Today.
// Signed-out visitors are then sent on to the login page by the staff layout.
export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/today', locale });
}
