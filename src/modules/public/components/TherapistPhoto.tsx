import { initialsOf } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

/**
 * A therapist's portrait in a doorway (arch). The photo is served same-origin and only while the therapist is public;
 * without one, a teak-to-night gradient carries their initials.
 */
export function TherapistPhoto({ id, name, hasPhoto, className }: { id: string; name: string; hasPhoto: boolean; className?: string }) {
  const box = cn('arch relative bg-[linear-gradient(165deg,var(--teak),var(--surface)_70%)]', className);
  // eslint-disable-next-line @next/next/no-img-element -- a small same-origin image from our own route; next/image would add nothing here
  if (hasPhoto) return <div className={box}><img src={`/api/public/therapists/${id}/photo`} alt={name} className="size-full object-cover" loading="lazy" /></div>;
  return (
    <div className={cn(box, 'flex items-end justify-center')} role="img" aria-label={name}>
      <span aria-hidden className="mb-[16%] font-serif text-6xl font-normal text-brass/70">{initialsOf(name)}</span>
    </div>
  );
}
