export function Wordmark({ name, tagline }: { name: string; tagline: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-serif text-xl leading-tight text-ink">{name}</div>
      <div className="truncate text-caption text-ink-muted">{tagline}</div>
    </div>
  );
}
