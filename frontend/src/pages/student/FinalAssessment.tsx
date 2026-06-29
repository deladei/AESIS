import { Loader2, Award, Lock, FileText, Building2, Star, CheckCircle2 } from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useFinalAssessment } from '@/hooks/useFinalization';
import { GradePanel } from '@/components/grades/GradePanel';

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
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const placement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data, isLoading, isError } = useFinalAssessment(placement?.id);

  if (placementsLoading || (placement && isLoading)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" />
      </div>
    );
  }

  // No placement, or the gated endpoint denied (not finalized yet) → locked state.
  if (!placement || isError || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Final Assessment</h1>
        {/* Released final grade is independent of finalization — show it if there is one. */}
        {placement && <GradePanel placementId={placement.id} />}
        <div className="flex items-start gap-3 rounded-xl bg-[var(--h-f3f3f7)] p-8 text-[var(--h-444653)]">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--h-15157d)]" />
          <div>
            <p className="font-semibold text-[var(--h-0b1c30)]">Not available yet</p>
            <p className="mt-1 text-sm">
              Your final assessment will appear here once your supervisor finalizes and signs off your internship.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Final Assessment</h1>
          <p className="mt-1 text-sm text-[var(--h-757684)]">
            {data.organisation && (<><Building2 className="mr-1 inline h-3.5 w-3.5" />{data.organisation} · </>)}
            {fmtDate(data.startDate)} – {fmtDate(data.endDate)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--h-e9f9ef)] px-3 py-1 text-xs font-semibold text-[var(--h-1b7a45)]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Finalized
        </span>
      </header>

      {/* Grade + sign-off */}
      <section className="rounded-xl bg-[var(--h-ffffff)] p-8 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--h-eef1ff)] text-[var(--h-15157d)]">
            <Award className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--h-757684)]">Final grade</p>
            <p className="text-3xl font-extrabold text-[var(--h-0b1c30)]">{data.grade ?? '—'}</p>
          </div>
        </div>
        {(data.signedOffBy || data.signedOffAt) && (
          <p className="mt-4 border-t border-[var(--h-eef1ff)] pt-3 text-xs text-[var(--h-757684)]">
            Signed off{data.signedOffBy ? ` by ${data.signedOffBy}` : ''}{data.signedOffAt ? ` on ${fmtDate(data.signedOffAt)}` : ''}.
          </p>
        )}
      </section>

      {/* Released overall grade (/100), separate from the finalization sign-off above. */}
      <GradePanel placementId={placement.id} />

      {/* Evaluation */}
      {data.evaluation && (data.evaluation.criteria.length > 0 || data.evaluation.recommendation) && (
        <section className="rounded-xl bg-[var(--h-ffffff)] p-8 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[var(--h-0b1c30)]">Supervisor evaluation</h2>
          {data.evaluation.recommendation && (
            <p className="mb-4 inline-flex rounded-full bg-[var(--h-e1e0ff)] px-3 py-1 text-xs font-semibold text-[var(--h-15157d)]">
              Recommendation: {RECOMMENDATION_LABEL[data.evaluation.recommendation] ?? data.evaluation.recommendation}
            </p>
          )}
          <ul className="space-y-3">
            {data.evaluation.criteria.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-4 border-b border-[var(--h-f3f3f7)] pb-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--h-0b1c30)]">{c.criterion}</p>
                  {c.comment && <p className="text-xs text-[var(--h-757684)]">{c.comment}</p>}
                </div>
                <div className="flex shrink-0 gap-0.5 text-[var(--h-15157d)]">
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
        <section className="rounded-xl bg-[var(--h-ffffff)] p-8 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-[var(--h-0b1c30)]">Narrative</h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--h-444653)]">{data.narrative}</p>
        </section>
      )}

      {/* Artifacts */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--h-ffffff)] p-6 shadow-sm">
          <p className="mb-2 text-sm font-bold text-[var(--h-0b1c30)]">Final report</p>
          {data.finalReport ? (
            <a href={data.finalReport.fileUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--h-15157d)] hover:underline">
              <FileText className="h-4 w-4" /> {data.finalReport.fileName}
            </a>
          ) : (
            <p className="text-sm text-[var(--h-757684)]">Not uploaded.</p>
          )}
        </div>
        <div className="rounded-xl bg-[var(--h-ffffff)] p-6 shadow-sm">
          <p className="mb-2 text-sm font-bold text-[var(--h-0b1c30)]">Company attestation</p>
          {data.companyAttestation?.attestedAt ? (
            <p className="text-sm text-[var(--h-444653)]">
              {data.companyAttestation.confirmed ? 'Confirmed' : 'Not confirmed'}
              {data.companyAttestation.comment ? ` — "${data.companyAttestation.comment}"` : ''}
            </p>
          ) : (
            <p className="text-sm text-[var(--h-757684)]">No attestation on file.</p>
          )}
        </div>
      </section>
    </div>
  );
}
