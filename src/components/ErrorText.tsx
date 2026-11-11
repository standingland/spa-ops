import { REF_MARK } from '@/lib/errors';

/** Renders an action error message; when it carries a reference code (added by errorText) the code is shown on its own. */
export function ErrorText({ text }: { text: string }) {
  const [message, ref] = text.split(REF_MARK);
  return (
    <>
      {message}
      {ref && (
        <>
          {' '}
          <span data-testid="error-ref" className="tnum font-semibold">{ref}</span>
        </>
      )}
    </>
  );
}
