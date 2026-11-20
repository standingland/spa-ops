import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { CareersPage } from "@/modules/careers/CareersPage";

export const metadata: Metadata = {
  title: "Careers | Banyan Spa",
  description: "Banyan Spa is hiring male massage therapists in Bangkok.",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <CareersPage locale={locale} />;
}
