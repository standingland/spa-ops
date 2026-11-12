// Decorative only: login page. Carries no meaning, so it is hidden from assistive tech.
export function Leaf({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 100C20 52 52 20 100 20c0 48-32 80-80 80Z" />
      <path d="M20 100 78 42M52 70h24M40 82h20M62 58V36" />
    </svg>
  );
}
