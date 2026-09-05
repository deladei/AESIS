import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'done';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-secondary',
  brand:   'bg-brand-soft text-brand-ink',
  ok:      'bg-ok-soft text-ok',
  warn:    'bg-warn-soft text-warn',
  danger:  'bg-danger-soft text-danger',
  info:    'bg-info-soft text-info',
  done:    'bg-done-soft text-done',
};

/**
 * The status pill used on every row in the mockups.
 *
 * Tone is a semantic slot, never a decorative colour, and the label is always
 * rendered — colour alone never carries the meaning, so the pill still reads
 * correctly in greyscale, in forced-colours mode, and for a colour-blind
 * viewer.
 */
export function Badge({
  children,
  tone = 'neutral',
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  icon?: React.ElementType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/** A coloured dot + label, for chart legends and compact list rows. */
export function LegendDot({
  color, label, value, className,
}: {
  /** A CSS colour — pass a chart token, e.g. `var(--chart-1)`. */
  color: string;
  label: string;
  /** Count and/or share. Present so the legend satisfies the relief rule for
   *  low-contrast chart hues: identity never rests on the swatch alone. */
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-ink-secondary">{label}</span>
      {value != null && <span className="ml-auto font-semibold text-ink">{value}</span>}
    </div>
  );
}
