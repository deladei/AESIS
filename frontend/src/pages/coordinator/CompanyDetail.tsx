import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Globe, Loader2, Users, Inbox } from 'lucide-react';
import { useCompanyInterns } from '@/hooks/usePlacements';

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-ok-soft text-ok border-ok',
  pending:   'bg-warn-soft text-warn border-warn',
  rejected:  'bg-danger-soft text-danger border-danger',
  withdrawn: 'bg-danger-soft text-danger border-danger',
  failed:    'bg-danger-soft text-danger border-danger',
  completed: 'bg-brand-soft text-brand-ink border-line',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-surface-sunken text-ink-muted border-line';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Company detail — every intern doing their internship at one host company.
 * Destination when a coordinator clicks a company card on the Companies list.
 */
export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useCompanyInterns(id);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-ink" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Link to="/coordinator/companies" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">
          <ArrowLeft className="h-4 w-4" /> All companies
        </Link>
        <div className="rounded-xl bg-danger-soft p-6 text-sm font-medium text-danger">
          Couldn't load this company. It may have been removed.
        </div>
      </div>
    );
  }

  const { company, placements } = data;
  const active = placements.filter((p) => p.placementStatus === 'active').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link to="/coordinator/companies" className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">
          <ArrowLeft className="h-4 w-4" /> All companies
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-soft">
            <Building2 className="h-6 w-6 text-brand-ink" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink">{company.name}</h1>
            <p className="text-sm text-ink-muted">
              {company.industry ?? 'Host company'} ·{' '}
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {placements.length} intern{placements.length === 1 ? '' : 's'}
                {active > 0 && ` (${active} active)`}
              </span>
              {company.website && (
                <>
                  {' · '}
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {placements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface py-16 text-center">
          <Inbox className="h-7 w-7 text-ink-muted" />
          <p className="text-sm text-ink-muted">No interns placed at this company yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3">Intern</th>
                  <th className="px-5 py-3">Index no.</th>
                  <th className="px-5 py-3">Supervisor</th>
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">
                        {p.student.firstName} {p.student.lastName}
                      </p>
                      <p className="text-xs text-ink-muted">{p.student.email}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-ink-secondary">{p.student.indexNumber ?? '—'}</td>
                    <td className="px-5 py-4 text-ink-secondary">
                      {p.academicSupervisor
                        ? `${p.academicSupervisor.firstName} ${p.academicSupervisor.lastName}`
                        : <span className="text-warn">Unassigned</span>}
                    </td>
                    <td className="px-5 py-4 text-ink-secondary">
                      {fmtDate(p.startDate)} – {fmtDate(p.endDate)}
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={p.placementStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
