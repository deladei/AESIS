import { Clock } from 'lucide-react';

/**
 * "This was logged N days after the day it describes."
 *
 * Lateness is derived server-side from the immutable `created_at`, so the number
 * is evidence, not a status the student can edit. Three screens had grown their
 * own copy of this pill with three different wordings (and one with no icon);
 * this is the one label they all now render, so a student and their supervisor
 * are always reading the same sentence.
 */
export default function LatePill({
  days,
  compact = false,
  className = '',
}: {
  days: number;
  /** Tighter type for dense rows (activity lines, day chips). */
  compact?: boolean;
  className?: string;
}) {
  // On time is not a state worth a badge — say nothing rather than "0 days late".
  if (!Number.isFinite(days) || days <= 0) return null;

  const label = compact
    ? `${days}d late`
    : `Late — ${days} day${days === 1 ? '' : 's'}`;

  return (
    <span
      title={`Logged ${days} day${days === 1 ? '' : 's'} after the work date`}
      className={`inline-flex items-center gap-1 rounded-full bg-warn-soft font-semibold text-warn ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${className}`}
    >
      <Clock className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> {label}
    </span>
  );
}
