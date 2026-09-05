import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './Card';

/**
 * The "+12% from last month" chip.
 *
 * `value` is null when there is only one period of history to compare against,
 * and then nothing renders at all — a pilot cohort has no year-over-year, and a
 * fabricated delta is exactly the sort of number nobody can defend.
 */
export function DeltaChip({ value, period }: { value: number | null; period: string }) {
  if (value == null) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn('mt-1 inline-flex items-center gap-1 text-xs font-semibold', up ? 'text-ok' : 'text-danger')}>
      <Icon className="h-3.5 w-3.5" />
      {up ? '+' : ''}{value}%
      <span className="font-normal text-ink-muted">{period}</span>
    </span>
  );
}

type Tone = 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'done' | 'neutral';

const tile: Record<Tone, string> = {
  brand:  'bg-brand-soft text-brand-ink',
  ok:     'bg-ok-soft text-ok',
  warn:   'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info:   'bg-info-soft text-info',
  done:   'bg-done-soft text-done',
  // For a count that is neither good nor bad — "not started" is a state, not a
  // problem, and tinting it red or amber would editorialise the number.
  neutral: 'bg-surface-sunken text-ink-secondary',
};

interface StatCardProps {
  label: string;
  /** The headline. Pass a string so "—" can be rendered for "no answer". */
  value: React.ReactNode;
  icon: React.ElementType;
  tone?: Tone;
  /** One line under the value: a date, a caveat, a count. */
  footnote?: React.ReactNode;
  /** Optional deep link rendered as the card's footer action. */
  action?: { label: string; to: string };
  /** Rendered between value and footnote — a progress bar, a delta chip. */
  children?: React.ReactNode;
  loading?: boolean;
}

/**
 * The KPI tile across the top of every dashboard: tinted icon square, label,
 * one big number, and an optional footer link.
 *
 * `value` is deliberately a ReactNode and not a number. Several of these
 * metrics are legitimately unanswerable — no weeks due yet, no cohort history
 * to compare against — and the house rule is that those render an em dash
 * rather than a 0 that reads as a real measurement.
 */
export function StatCard({
  label, value, icon: Icon, tone = 'brand', footnote, action, children, loading,
}: StatCardProps) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3">
        <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', tile[tone])}>
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-secondary">{label}</p>

          {loading ? (
            <div className="mt-1.5 h-7 w-20 animate-pulse rounded bg-surface-sunken" />
          ) : (
            <p className="mt-0.5 truncate text-2xl font-bold leading-tight text-ink">{value}</p>
          )}

          {children}

          {footnote && !loading && (
            <p className="mt-1 text-xs text-ink-muted">{footnote}</p>
          )}
        </div>
      </div>

      {action && (
        <Link
          to={action.to}
          className="mt-3 text-xs font-semibold text-brand-ink hover:underline"
        >
          {action.label} →
        </Link>
      )}
    </Card>
  );
}
