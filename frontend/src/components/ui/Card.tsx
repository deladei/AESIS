import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The panel every dashboard widget sits in.
 *
 * Before this existed, each page hand-wrote the same rounded-white-bordered div
 * — `SupervisorDashboard` and `AdminDashboard` carried two copies of it that had
 * already drifted apart. One card, one elevation: the mockups use a single soft
 * lift everywhere, and a second elevation reads as noise rather than hierarchy.
 */
export function Card({
  className,
  children,
  padded = true,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-card',
        padded && 'p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  /** Small grey line under the title. Omitted when there is nothing to add. */
  subtitle?: React.ReactNode;
  /** The "View all →" affordance. A route, or a button handler — not both. */
  action?: { label: string; to?: string; onClick?: () => void };
  /** Arbitrary control (a <select>, a filter) rendered instead of `action`. */
  control?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, control, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      </div>

      {control}

      {!control && action && (
        action.to ? (
          <Link
            to={action.to}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )
      )}
    </div>
  );
}
