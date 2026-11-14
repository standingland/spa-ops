import { getBrand } from '@/lib/brand';
import { LocaleSwitch } from '@/modules/identity/components/LocaleSwitch';

/** The public pages: an evening palette, no staff navigation, nothing that needs a login. */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  const brand = getBrand(process.env);
  return (
    <div className="theme-night min-h-screen">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-6">
        <div className="min-w-0">
          <div className="truncate font-serif text-xl tracking-[0.16em] text-ink">{brand.name}</div>
          <div className="truncate text-caption text-ink-muted">{brand.tagline}</div>
        </div>
        <LocaleSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 pb-16">{children}</main>
    </div>
  );
}
