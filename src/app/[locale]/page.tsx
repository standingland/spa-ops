import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { LandingPage } from "@/modules/landing/LandingPage";

export const metadata: Metadata = {
  title: "Banyan Spa | A quieter kind of luxury in Bangkok",
  description:
    "A private luxury spa for men in Bangkok. Discover considered massages, body rituals, and the art of slowing down at Banyan Spa.",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <LandingPage locale={locale} />;
}
