import { cn } from '@/lib/cn';

/** Up to two initials, whole letters (grapheme clusters) so Thai vowel and tone marks stay with their consonant. */
export function initialsOf(name: string): string {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const first = (w: string) => [...seg.segment(w)][0]?.segment ?? '';
  const out = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(first).join('');
  return out || '?';
}

const SIZE = { sm: 'size-8 text-caption', md: 'size-12 text-body' } as const;

export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string | null; size?: keyof typeof SIZE; className?: string }) {
  const box = cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted text-ink', SIZE[size], className);
  // eslint-disable-next-line @next/next/no-img-element -- a small signed-URL image; next/image would need a remote loader for no gain
  if (src) return <span className={box}><img src={src} alt={name} className="size-full object-cover" /></span>;
  return <span className={box} role="img" aria-label={name}>{initialsOf(name)}</span>;
}
