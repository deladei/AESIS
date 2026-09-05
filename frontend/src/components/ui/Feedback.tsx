import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The empty state.
 *
 * On a fresh cohort almost every panel is empty, so this is the common case,
 * not an edge case — it has to look deliberate rather than broken. It says what
 * would appear here and, where there is one, offers the action that fills it.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  hint?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)}>
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-sunken text-ink-muted">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-ink-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Panel-level failure. Never silently swallows — a retry is always offered. */
export function ErrorState({
  message = 'Could not load this panel.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)}>
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-ink">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-surface-sunken"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Loading placeholder shaped like the rows it stands in for. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-surface-sunken" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-surface-sunken" />
          </div>
        </div>
      ))}
    </div>
  );
}
