import { AlertCircle } from 'lucide-react';

/**
 * Inline, per-field validation message. Renders nothing when the field is
 * valid, so it can sit unconditionally under every input without reserving
 * space or producing an empty node.
 *
 * `role="alert"` so a screen reader announces the message when it appears;
 * pair the input with `aria-invalid={!!message}`.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 flex items-start gap-1 text-[11px] font-medium text-[var(--h-b3261e)]">
      <AlertCircle className="mt-px h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}
