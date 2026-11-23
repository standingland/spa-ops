export function BanyanMark({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 64 64" fill="none">
      <path
        d="M32 58V28m0 15L20 31m12 5 12-12M21 49h22M14 27c-7 0-8-11-1-14 1-9 13-11 19-5 7-6 19-4 20 5 8 3 6 14-1 14H14Z"
        stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M19 27v10m26-10v10M25 9v9m14-9v9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
