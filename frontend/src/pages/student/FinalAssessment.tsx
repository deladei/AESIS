import { useState } from 'react';
import { Loader2, Award, Lock, FileText, Building2, Star, CheckCircle2, Sparkles } from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useFinalAssessment } from '@/hooks/useFinalization';
import { GradePanel } from '@/components/grades/GradePanel';
import { InternshipRecap } from '@/components/student/InternshipRecap';

const RECOMMENDATION_LABEL: Record<string, string> = {
  pass: 'Pass', distinction: 'Distinction', resit: 'Resit', fail: 'Fail',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Student-facing closeout view. The backend only returns the package once the
 * placement is finalized (403 otherwise), so a locked state is shown until then.
 */
export default function FinalAssessment() {
  const [showSample, setShowSample] = useState(false);
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const placement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data, isLoading, isError } = useFinalAssessment(placement?.id);

  if (placementsLoading || (placement && isLoading)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-ink" />
      </div>
    );
  }

  // No placement, or the gated endpoint denied (not finalized yet) → locked state.
  if (!placement || isError || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-bold text-ink">Final Assessment</h1>
        {/* Released final grade is independent of finalization — show it if there is one. */}
        {placement && <GradePanel placementId={placement.id} />}
        <div className="flex items-start gap-3 rounded-xl bg-surface-sunken p-8 text-ink-secondary">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">Not available yet</p>
            <p className="mt-1 text-sm">
              Your final assessment will appear here once your supervisor finalizes and signs off your internship.
            </p>
            {/* The recap is built entirely from the student's own logbook, so
                showing an example now is also a nudge to keep logging. */}
            <button
              type="button"
              onClick={() => setShowSample((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand bg-surface px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors hover:bg-brand-soft"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {showSample ? 'Hide the example recap' : 'Preview your end-of-internship recap'}
            </button>
          </div>
        </div>

        {showSample && <InternshipRecap enabled sample />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Final Assessment</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {data.organisation && (<><Building2 className="mr-1 inline h-3.5 w-3.5" />{data.organisation} · </>)}
            {fmtDate(data.startDate)} – {fmtDate(data.endDate)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">
          <CheckCircle2 className="h-3.5 w-3.5" /> Finalized
        </span>
      </header>

      {/* Grade + sign-off */}
      <section className="rounded-xl bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-brand-ink">
            <Award className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-muted">Final grade</p>
            <p className="text-3xl font-extrabold text-ink">{data.grade ?? '—'}</p>
          </div>
        </div>
        {(data.signedOffBy || data.signedOffAt) && (
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
            Signed off{data.signedOffBy ? ` by ${data.signedOffBy}` : ''}{data.signedOffAt ? ` on ${fmtDate(data.signedOffAt)}` : ''}.
          </p>
        )}
      </section>

      {/* Released overall grade (/100), separate from the finalization sign-off above. */}
      {/* Student-authored recap — renders only once the placement is finalized
          (the endpoint gates it) and never reads assessment or grade data. */}
      <InternshipRecap enabled={!!placement} />

      <GradePanel placementId={placement.id} />

      {/* Evaluation */}
      {data.evaluation && (data.evaluation.criteria.length > 0 || data.evaluation.recommendation) && (
        <section className="rounded-xl bg-surface p-8 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-ink">Supervisor evaluation</h2>
          {data.evaluation.recommendation && (
            <p className="mb-4 inline-flex rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">
              Recommendation: {RECOMMENDATION_LABEL[data.evaluation.recommendation] ?? data.evaluation.recommendation}
            </p>
          )}
          <ul className="space-y-3">
            {data.evaluation.criteria.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{c.criterion}</p>
                  {c.comment && <p className="text-xs text-ink-muted">{c.comment}</p>}
                </div>
                <div className="flex shrink-0 gap-0.5 text-brand-ink">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className="h-4 w-4" fill={n <= c.rating ? 'currentColor' : 'none'} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Narrative */}
      {data.narrative && (
        <section className="rounded-xl bg-surface p-8 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-ink">Narrative</h2>
          <p className="whitespace-pre-wrap text-sm text-ink-secondary">{data.narrative}</p>
        </section>
      )}

      {/* Artifacts */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-surface p-6 shadow-sm">
          <p className="mb-2 text-sm font-bold text-ink">Final report</p>
          {data.finalReport ? (
            <a href={data.finalReport.fileUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-ink hover:underline">
              <FileText className="h-4 w-4" /> {data.finalReport.fileName}
            </a>
          ) : (
            <p className="text-sm text-ink-muted">Not uploaded.</p>
          )}
        </div>
        <div className="rounded-xl bg-surface p-6 shadow-sm">
          <p className="mb-2 text-sm font-bold text-ink">Company attestation</p>
          {data.companyAttestation?.attestedAt ? (
            <p className="text-sm text-ink-secondary">
              {data.companyAttestation.confirmed ? 'Confirmed' : 'Not confirmed'}
              {data.companyAttestation.comment ? ` — "${data.companyAttestation.comment}"` : ''}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">No attestation on file.</p>
          )}
        </div>
      </section>
    </div>
  );
}
