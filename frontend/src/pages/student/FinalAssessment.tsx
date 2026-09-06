import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, Lock, FileText, Building2, Star, CheckCircle2, Sparkles,
  GraduationCap, Info, ArrowRight, EyeOff, Eye,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useFinalAssessment } from '@/hooks/useFinalization';
import { useGrade } from '@/hooks/useGrade';
import { GradePanel } from '@/components/grades/GradePanel';
import { InternshipRecap } from '@/components/student/InternshipRecap';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { SkeletonRows } from '@/components/ui/Feedback';

const RECOMMENDATION_LABEL: Record<string, string> = {
  pass: 'Pass', distinction: 'Distinction', resit: 'Resit', fail: 'Fail',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The page header, shared by the locked and finalized states. */
function Header({ subtitle }: { subtitle: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-brand-ink">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Final Assessment</h1>
          <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
        </div>
      </div>

      {/*
        The reference puts an "AI Preparation Coach" panel here with a
        "Help me prepare" button. There is no exam-prep model behind this
        product, but there IS a real assistant grounded in the department's
        regulations — so the card points at that rather than at nothing.
      */}
      <Link
        to="/student/chatbot"
        className="group flex max-w-sm items-center gap-3 rounded-card bg-brand px-4 py-3 text-ink-inverse transition-colors hover:bg-brand-hover"
      >
        <Sparkles className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Ask the assistant</span>
          <span className="block text-xs opacity-80">
            Questions about grading, deadlines or what happens next.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </header>
  );
}

/** What the student's grade is actually doing right now — never a guess. */
function GradeStateCard({ placementId }: { placementId: string }) {
  const { data: grade, isLoading } = useGrade(placementId);

  const state: { tone: BadgeTone; label: string; body: string } = (() => {
    if (!grade) {
      return {
        tone: 'neutral', label: 'Not started',
        body: 'Your final grade will appear here once it has been signed off and released.',
      };
    }
    if (grade.released) {
      return { tone: 'ok', label: 'Released', body: 'Your final grade has been released — it is shown below.' };
    }
    if (grade.status === 'approved') {
      return {
        tone: 'brand', label: 'Ready for release',
        body: 'Your grade has been signed off and is waiting on the coordinator to release it.',
      };
    }
    return {
      tone: 'warn', label: 'In progress',
      body: 'Your final grade will appear here once it has been signed off and released.',
    };
  })();

  return (
    <Card className="h-full">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-brand-ink">
          <Award className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">Final grade</p>
          {isLoading ? (
            <div className="mt-2"><SkeletonRows rows={1} /></div>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-secondary">{state.body}</p>
              <div className="mt-3"><Badge tone={state.tone}>{state.label}</Badge></div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Student-facing closeout view. The backend only returns the package once the
 * placement is finalized (403 otherwise), so a locked state is shown until then
 * — and since that is the state a student sees for most of the programme, it is
 * laid out as a real page rather than an apology.
 */
export default function FinalAssessment() {
  const [showSample, setShowSample] = useState(false);
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const placement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data, isLoading, isError } = useFinalAssessment(placement?.id);

  if (placementsLoading || (placement && isLoading)) {
    return <div className="mx-auto max-w-[1500px] p-4 sm:p-6"><Card><SkeletonRows rows={6} /></Card></div>;
  }

  // ── Locked: no placement, or the gated endpoint denied (not finalized) ──
  if (!placement || isError || !data) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
        <Header subtitle="This is where your learning journey comes together." />

        <div className="grid gap-5 lg:grid-cols-2">
          {placement
            ? <GradeStateCard placementId={placement.id} />
            : (
              <Card className="h-full">
                <p className="text-[15px] font-semibold text-ink">Final grade</p>
                <p className="mt-1 text-sm text-ink-secondary">
                  You have no placement on record yet, so there is nothing to grade.
                </p>
              </Card>
            )}

          <Card className="h-full">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-surface-sunken text-ink-secondary">
                <Lock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">Not available yet</p>
                <p className="mt-1 text-sm text-ink-secondary">
                  Your final assessment will appear here once your supervisor finalizes and signs
                  off your internship.
                </p>
                {/* The recap is built entirely from the student's own logbook,
                    so showing an example now is also a nudge to keep logging. */}
                <button
                  type="button"
                  onClick={() => setShowSample((v) => !v)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
                >
                  {showSample ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showSample ? 'Hide the example recap' : 'Preview your end-of-internship recap'}
                </button>
              </div>
            </div>
          </Card>
        </div>

        {showSample && <InternshipRecap enabled sample />}

        {placement && <GradePanel placementId={placement.id} />}

        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
              <Info className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">What happens next?</p>
              <p className="mt-0.5 text-sm text-ink-secondary">
                Your supervisor acknowledges each week, then finalizes the placement. Once they
                sign off, your grade and their comments appear on this page.
              </p>
            </div>
            <Link
              to="/student/submissions"
              className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
            >
              See my submissions
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // ── Finalized ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <Header
        subtitle={
          <>
            {data.organisation && (<><Building2 className="mr-1 inline h-3.5 w-3.5" />{data.organisation} · </>)}
            {fmtDate(data.startDate)} – {fmtDate(data.endDate)}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="h-full">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink">
              <Award className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-ink-muted">Final grade</p>
              <p className="text-3xl font-extrabold text-ink">{data.grade ?? '—'}</p>
            </div>
          </div>
          {(data.signedOffBy || data.signedOffAt) && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
              Signed off{data.signedOffBy ? ` by ${data.signedOffBy}` : ''}
              {data.signedOffAt ? ` on ${fmtDate(data.signedOffAt)}` : ''}.
            </p>
          )}
        </Card>

        <Card className="h-full">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-ok-soft text-ok">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">Internship finalized</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Your supervisor has closed this placement. Everything below is the record they
                signed off.
              </p>
              <div className="mt-3"><Badge tone="ok" icon={CheckCircle2}>Finalized</Badge></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Student-authored recap — reads only the student's own logbook, never
          assessment or grade data. */}
      <InternshipRecap enabled={!!placement} />

      <GradePanel placementId={placement.id} />

      {data.evaluation && (data.evaluation.criteria.length > 0 || data.evaluation.recommendation) && (
        <Card>
          <CardHeader
            title="Supervisor evaluation"
            subtitle={data.evaluation.recommendation
              ? `Recommendation: ${RECOMMENDATION_LABEL[data.evaluation.recommendation] ?? data.evaluation.recommendation}`
              : undefined}
          />
          <ul className="space-y-3">
            {data.evaluation.criteria.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{c.criterion}</p>
                  {c.comment && <p className="text-xs text-ink-muted">{c.comment}</p>}
                </div>
                <div className="flex shrink-0 gap-0.5 text-brand-ink" aria-label={`${c.rating} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className="h-4 w-4" fill={n <= c.rating ? 'currentColor' : 'none'} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.narrative && (
        <Card>
          <CardHeader title="Narrative" />
          <p className="whitespace-pre-wrap text-sm text-ink-secondary">{data.narrative}</p>
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader title="Final report" />
          {data.finalReport ? (
            <a
              href={data.finalReport.fileUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink hover:underline"
            >
              <FileText className="h-4 w-4" /> {data.finalReport.fileName}
            </a>
          ) : (
            <p className="text-sm text-ink-muted">Not uploaded.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Company attestation" />
          {data.companyAttestation?.attestedAt ? (
            <p className="text-sm text-ink-secondary">
              {data.companyAttestation.confirmed ? 'Confirmed' : 'Not confirmed'}
              {data.companyAttestation.comment ? ` — "${data.companyAttestation.comment}"` : ''}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">No attestation on file.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
