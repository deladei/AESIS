import { cn } from '@/lib/utils';

type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'flagged';
type AiStatus = 'pending' | 'processing' | 'completed' | 'failed';

const submissionConfig: Record<SubmissionStatus, { label: string; classes: string }> = {
  draft:        { label: 'Draft',          classes: 'bg-slate-700/50 text-slate-400 border-slate-600' },
  submitted:    { label: 'Submitted',      classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  under_review: { label: 'Under Review',   classes: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  approved:     { label: 'Approved',       classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  flagged:      { label: 'Flagged',        classes: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

const aiConfig: Record<AiStatus, { label: string; classes: string }> = {
  pending:    { label: 'AI Pending',    classes: 'bg-slate-700/50 text-slate-400 border-slate-600' },
  processing: { label: 'AI Processing', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  completed:  { label: 'AI Done',       classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  failed:     { label: 'AI Failed',     classes: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

interface StatusBadgeProps {
  type: 'submission' | 'ai';
  status: SubmissionStatus | AiStatus;
  className?: string;
}

export function StatusBadge({ type, status, className }: StatusBadgeProps) {
  const cfg = type === 'submission'
    ? submissionConfig[status as SubmissionStatus]
    : aiConfig[status as AiStatus];

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border text-xs px-2.5 py-0.5 font-medium',
      cfg.classes,
      className
    )}>
      {cfg.label}
    </span>
  );
}
