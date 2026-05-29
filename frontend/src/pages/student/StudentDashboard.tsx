import { Link } from 'react-router-dom';
import {
  Sparkles, ArrowRight, Check, Circle, Loader2, BookOpen, AlertTriangle, CalendarClock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useSubmissions, type LogbookSubmission } from '@/hooks/useLogbook';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const isPending = (s: LogbookSubmission) =>
  s.submissionStatus === 'not_submitted' || s.submissionStatus === 'draft';
const isSubmitted = (s: LogbookSubmission) => !isPending(s);

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const active = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data: submissions = [], isLoading: subsLoading } = useSubmissions(active?.id);

  if (placementsLoading || subsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#712ae2]" />
      </div>
    );
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-10">
        <h1 className="text-3xl font-bold text-[#15157d]">{greeting()}, {user?.firstName}</h1>
        <div className="mt-8 rounded-xl border border-[#c7c5d4]/40 bg-white p-10 text-center shadow-sm">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-[#8a4cfc]" />
          <p className="text-base font-semibold text-[#0b1c30]">No active placement yet</p>
          <p className="mt-1 text-sm text-[#464652]">
            Once your placement is approved, your logbook progress and AI feedback will appear here.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived metrics ───────────────────────────────────────────
  const total      = submissions.length;
  const submitted  = submissions.filter(isSubmitted);
  const scored     = submissions
    .filter((s) => s.analysis?.qualityScore != null)
    .sort((a, b) => a.weekNumber - b.weekNumber);

  const pct = total > 0 ? Math.round((submitted.length / total) * 100) : 0;

  const latestInsight = [...submissions]
    .filter((s) => s.analysis?.aiFeedbackSummary)
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];

  const maxScore = Math.max(100, ...scored.map((s) => s.analysis!.qualityScore!));
  const bars     = scored.slice(-10);

  // Checklist: pending weeks first (by deadline), then recently submitted
  const pending = submissions
    .filter(isPending)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const recentDone = [...submitted].sort((a, b) => b.weekNumber - a.weekNumber);
  const checklist  = [...pending, ...recentDone].slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-10">
      {/* Welcome */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#15157d]">
            {greeting()}, {user?.firstName}
          </h1>
          <p className="mt-1 text-base text-[#464652]">
            Here's your placement progress {active.company?.name ? `at ${active.company.name}` : ''}.
          </p>
        </div>
        {scored.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-[#dce9ff] px-4 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#22c087]" />
            <span className="text-xs font-semibold text-[#0b1c30]">
              AI analyzed {scored.length} {scored.length === 1 ? 'week' : 'weeks'}
            </span>
          </div>
        )}
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* AI Coach */}
        <div className="relative col-span-12 flex flex-col gap-4 overflow-hidden rounded-xl border border-[#712ae2]/20 bg-white/70 p-6 shadow-[0_4px_24px_-1px_rgba(113,42,226,0.1)] backdrop-blur-md lg:col-span-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#712ae2]/10 p-2">
              <Sparkles className="h-5 w-5 text-[#712ae2]" />
            </div>
            <h3 className="text-xl font-semibold text-[#15157d]">AI Coach</h3>
          </div>
          {latestInsight?.analysis?.aiFeedbackSummary ? (
            <>
              <p className="text-sm leading-relaxed text-[#464652]">
                {latestInsight.analysis.aiFeedbackSummary}
              </p>
              <div className="mt-auto space-y-3">
                <Link
                  to="/student/submissions"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#712ae2] py-2 text-sm font-medium text-[#712ae2] transition-colors hover:bg-[#712ae2]/5"
                >
                  Review feedback <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#777683]">
                  Week {latestInsight.weekNumber} · {timeAgo(latestInsight.submittedAt)}
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-[#464652]">
                No AI feedback yet. Submit a logbook entry and AESIS will analyze your quality,
                relevance and reflection automatically.
              </p>
              <div className="mt-auto">
                <Link
                  to="/student/logbook"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#712ae2] py-2 text-sm font-medium text-[#712ae2] transition-colors hover:bg-[#712ae2]/5"
                >
                  Start a logbook entry <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          )}
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-[#712ae2]/10 blur-3xl" />
        </div>

        {/* Weekly quality */}
        <div className="col-span-12 flex flex-col rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm lg:col-span-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#15157d]">Quality Score</h3>
              <p className="text-xs text-[#464652]">NLP-scored logbook quality per week</p>
            </div>
            <span className="font-mono text-xs text-[#777683]">0 – 100</span>
          </div>
          {bars.length > 0 ? (
            <div className="flex h-48 flex-1 items-end justify-between gap-2 px-1">
              {bars.map((s) => {
                const score = s.analysis!.qualityScore!;
                const isTop = score === Math.max(...bars.map((b) => b.analysis!.qualityScore!));
                return (
                  <div key={s.id} className="group flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end" title={`Week ${s.weekNumber}: ${score}/100`}>
                      <div
                        className={`w-full rounded-t-sm transition-colors ${isTop ? 'bg-[#15157d]' : 'bg-[#8a4cfc]/40 group-hover:bg-[#8a4cfc]/70'}`}
                        style={{ height: `${Math.max(4, (score / maxScore) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs ${isTop ? 'font-bold text-[#15157d]' : 'text-[#777683]'}`}>
                      W{s.weekNumber}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-48 flex-1 items-center justify-center text-sm text-[#777683]">
              No scored submissions yet
            </div>
          )}
        </div>

        {/* Logbook checklist */}
        <div className="col-span-12 rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm md:col-span-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#15157d]">Logbook</h3>
            <span className="rounded-full bg-[#dce9ff] px-3 py-1 text-xs font-semibold text-[#15157d]">
              {submitted.length} / {total} done
            </span>
          </div>
          {checklist.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#777683]">No logbook weeks scheduled.</p>
          ) : (
            <div className="space-y-1">
              {checklist.map((s) => {
                const done = isSubmitted(s);
                const overdue = !done && daysUntil(s.deadline) < 0;
                const dueSoon = !done && !overdue && daysUntil(s.deadline) <= 7;
                return (
                  <Link
                    key={s.id}
                    to={done ? '/student/submissions' : '/student/logbook'}
                    className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-[#eff4ff]"
                  >
                    {done ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#22c087]">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-[#c7c5d4]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${done ? 'text-[#777683] line-through' : 'text-[#0b1c30]'}`}>
                        Week {s.weekNumber}
                      </p>
                      <p className="text-xs text-[#777683]">
                        {done
                          ? `Submitted ${formatDate(s.submittedAt)}`
                          : `Due ${formatDate(s.deadline)}`}
                      </p>
                    </div>
                    {overdue && (
                      <span className="flex items-center gap-1 rounded-full bg-[#ffdad6] px-2 py-0.5 text-[11px] font-semibold text-[#ba1a1a]">
                        <AlertTriangle className="h-3 w-3" /> Overdue
                      </span>
                    )}
                    {dueSoon && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <CalendarClock className="h-3 w-3" /> Due soon
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Milestones */}
        <div className="col-span-12 rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm md:col-span-6">
          <h3 className="mb-6 text-xl font-semibold text-[#15157d]">Milestones</h3>
          <div className="relative space-y-8">
            <div className="absolute bottom-2 left-[11px] top-2 w-[2px] bg-[#c7c5d4]/40" />

            {/* Started */}
            <div className="relative flex gap-4">
              <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#22c087]">
                <Check className="h-3.5 w-3.5 text-white" />
              </span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#0b1c30]">Placement started</h4>
                <p className="text-sm text-[#464652]">
                  {active.startDate ? `Began ${formatDate(active.startDate)}` : 'In progress'}
                </p>
              </div>
            </div>

            {/* Logbook progress (current) */}
            <div className="relative flex gap-4">
              <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#15157d]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              </span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#15157d]">Logbook submissions</h4>
                <p className="mb-2 text-sm text-[#464652]">{pct}% complete · {submitted.length} of {total} weeks</p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#eff4ff]">
                  <div className="h-full rounded-full bg-[#15157d] transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            {/* Complete (upcoming) */}
            <div className={`relative flex gap-4 ${pct >= 100 ? '' : 'opacity-50'}`}>
              <span className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${pct >= 100 ? 'bg-[#22c087]' : 'bg-[#dce9ff]'}`}>
                {pct >= 100
                  ? <Check className="h-3.5 w-3.5 text-white" />
                  : <span className="h-2 w-2 rounded-full bg-[#777683]" />}
              </span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-[#0b1c30]">Placement complete</h4>
                <p className="text-sm text-[#464652]">
                  {active.endDate ? `Scheduled for ${formatDate(active.endDate)}` : 'End date pending'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
