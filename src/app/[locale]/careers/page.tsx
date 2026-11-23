import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { CareersPage } from "@/modules/careers/CareersPage";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "ร่วมงานกับ Banyan Spa | รับสมัครเทอราปิสชาย",
  description:
    "รับสมัครเทอราปิสชาย ร่วมงานกับ Banyan Spa มาร่วมดูแลลูกค้าทีละคนในพื้นที่ส่วนตัว",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return (
    <div className={playfair.variable}>
      <CareersPage locale={locale} />
    </div>
  );
}
