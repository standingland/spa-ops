import { initialsOf } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

/** The public photo (served same-origin, and only while the therapist is public) or, without one, their initials. */
export function TherapistPhoto({ id, name, hasPhoto, className }: { id: string; name: string; hasPhoto: boolean; className?: string }) {
  const box = cn('flex items-center justify-center overflow-hidden bg-surface-muted font-serif text-ink', className);
  // eslint-disable-next-line @next/next/no-img-element -- a small same-origin image from our own route; next/image would add nothing here
  if (hasPhoto) return <div className={box}><img src={`/api/public/therapists/${id}/photo`} alt={name} className="size-full object-cover" loading="lazy" /></div>;
  return <div className={box} role="img" aria-label={name}><span className="text-3xl">{initialsOf(name)}</span></div>;
}
