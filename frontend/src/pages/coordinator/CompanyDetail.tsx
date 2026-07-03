import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Globe, Loader2, Users, Inbox } from 'lucide-react';
import { useCompanyInterns } from '@/hooks/usePlacements';

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  withdrawn: 'bg-red-50 text-red-700 border-red-200',
  failed:    'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-[var(--h-e5eeff)] text-[var(--h-15157d)] border-[var(--h-c4c5d5)]',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-[var(--h-f8f9ff)] text-[var(--h-757684)] border-[var(--h-c4c5d5)]';
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
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Link to="/coordinator/companies" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-15157d)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> All companies
        </Link>
        <div className="rounded-xl bg-[var(--h-fde7e7)] p-6 text-sm font-medium text-[var(--h-8a1c1c)]">
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
        <Link to="/coordinator/companies" className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-15157d)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> All companies
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--h-e5eeff)]">
            <Building2 className="h-6 w-6 text-[var(--h-15157d)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">{company.name}</h1>
            <p className="text-sm text-[var(--h-757684)]">
              {company.industry ?? 'Host company'} ·{' '}
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {placements.length} intern{placements.length === 1 ? '' : 's'}
                {active > 0 && ` (${active} active)`}
              </span>
              {company.website && (
                <>
                  {' · '}
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--h-15157d)] hover:underline">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {placements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] py-16 text-center">
          <Inbox className="h-7 w-7 text-[var(--h-c4c5d5)]" />
          <p className="text-sm text-[var(--h-757684)]">No interns placed at this company yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--h-eef1ff)] text-xs font-semibold uppercase tracking-wide text-[var(--h-757684)]">
                  <th className="px-5 py-3">Intern</th>
                  <th className="px-5 py-3">Index no.</th>
                  <th className="px-5 py-3">Supervisor</th>
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--h-f3f3f7)] last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[var(--h-0b1c30)]">
                        {p.student.firstName} {p.student.lastName}
                      </p>
                      <p className="text-xs text-[var(--h-757684)]">{p.student.email}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-[var(--h-444653)]">{p.student.indexNumber ?? '—'}</td>
                    <td className="px-5 py-4 text-[var(--h-444653)]">
                      {p.academicSupervisor
                        ? `${p.academicSupervisor.firstName} ${p.academicSupervisor.lastName}`
                        : <span className="text-amber-600">Unassigned</span>}
                    </td>
                    <td className="px-5 py-4 text-[var(--h-444653)]">
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
