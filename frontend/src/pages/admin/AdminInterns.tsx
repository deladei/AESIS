import { useSearchParams } from 'react-router-dom';
import InternStatusTable from '@/components/coordinator/InternStatusTable';

/**
 * Admin interns list — the "Interns" destination from the admin sidebar.
 * Reuses the same sortable/filterable Intern Status Monitor the coordinator uses
 * (admin is authorized on every `/coordinator/*` endpoint and renders inside the
 * AdminShell). Honours `?attention=1` to deep-link straight to flagged interns.
 */
export default function AdminInterns() {
  const [params] = useSearchParams();
  const attentionOnly = params.get('attention') === '1';

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold tracking-wide text-[#15157d]">Admin</p>
        <h2 className="text-3xl font-bold tracking-tight text-[#0b1c30]">
          {attentionOnly ? 'Interns needing attention' : 'All Interns'}
        </h2>
        <p className="mt-1 text-sm text-[#757684]">Sort, filter, and drill into every active placement.</p>
      </div>
      <InternStatusTable pageSize={20} initialFilters={attentionOnly ? { attention: true } : undefined} />
    </div>
  );
}
