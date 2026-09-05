import { cn } from '@/lib/utils';

type BarTone = 'brand' | 'ok' | 'warn' | 'danger';

const barFill: Record<BarTone, string> = {
  brand:  'bg-brand',
  ok:     'bg-ok',
  warn:   'bg-warn',
  danger: 'bg-danger',
};

/**
 * A horizontal progress bar.
 *
 * `value` may be null — "no percentage to show" is a real answer here (nothing
 * due yet), and it renders an empty track rather than a full-looking zero.
 */
export function ProgressBar({
  value,
  tone = 'brand',
  className,
  label,
}: {
  value: number | null;
  tone?: BarTone;
  className?: string;
  /** Accessible name, since the bar itself carries no text. */
  label?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-sunken', className)}
      role="progressbar"
      aria-valuenow={value ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', barFill[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * The MAY / 18 date block from the schedule panels.
 * Month is uppercased for the tile only — this is typographic, not a shouted
 * label, and the accessible name spells the date out in full.
 */
export function DateTile({ date, tone = 'brand' }: { date: Date; tone?: 'brand' | 'ok' | 'warn' }) {
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const day = date.getDate();
  const tones = {
    brand: 'bg-brand-soft text-brand-ink',
    ok:    'bg-ok-soft text-ok',
    warn:  'bg-warn-soft text-warn',
  } as const;

  return (
    <div
      className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl leading-none', tones[tone])}
      aria-label={date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide">{month}</span>
      <span className="text-base font-bold">{day}</span>
    </div>
  );
}

/** Initials circle used where there is no avatar image. */
export function InitialsAvatar({
  name, size = 36, className,
}: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand-ink',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

/**
 * The one place "there is no answer" is rendered.
 *
 * A metric that cannot be computed shows this, never 0 and never 100 — a house
 * hard rule, and the reason the admin dashboard no longer claims a perfect
 * cohort when there is no cohort.
 */
export function NoValue({ title }: { title?: string }) {
  return (
    <span className="text-ink-muted" title={title ?? 'Not enough data yet'}>
      —
    </span>
  );
}
