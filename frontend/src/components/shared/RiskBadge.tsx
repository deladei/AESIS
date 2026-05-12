import { cn } from '@/lib/utils';

type RiskTier = 'low' | 'medium' | 'high';

interface RiskBadgeProps {
  tier: RiskTier;
  score?: number;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  className?: string;
}

const config: Record<RiskTier, { label: string; classes: string; dot: string }> = {
  low: {
    label: 'Low Risk',
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  medium: {
    label: 'Medium Risk',
    classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  high: {
    label: 'High Risk',
    classes: 'bg-red-500/10 text-red-400 border-red-500/30 glow-red',
    dot: 'bg-red-400 animate-pulse',
  },
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
  lg: 'text-base px-3 py-1.5 gap-2',
};

export function RiskBadge({ tier, score, size = 'md', showScore = false, className }: RiskBadgeProps) {
  const { label, classes, dot } = config[tier];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium font-mono',
        classes,
        sizeClasses[size],
        className
      )}
    >
      <span className={cn('rounded-full shrink-0', dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      {label}
      {showScore && score !== undefined && (
        <span className="ml-1 opacity-70">({score.toFixed(2)})</span>
      )}
    </span>
  );
}
