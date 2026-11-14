import type { Metadata } from 'next';
import { Noto_Serif_Thai, IBM_Plex_Sans_Thai } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { getBrand } from '@/lib/brand';
import { routing } from '@/i18n/routing';
import '../globals.css';

const serif = Noto_Serif_Thai({ variable: '--font-noto-serif', subsets: ['thai', 'latin'], weight: ['400', '500', '600'] });
const plex = IBM_Plex_Sans_Thai({ variable: '--font-plex', subsets: ['thai', 'latin'], weight: ['400', '500', '600'] });

export async function generateMetadata(): Promise<Metadata> {
  return { title: getBrand(process.env).name };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${serif.variable} ${plex.variable}`}>
      <body className="min-h-screen">
        <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
