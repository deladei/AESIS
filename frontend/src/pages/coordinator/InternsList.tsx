import { useSearchParams } from 'react-router-dom';
import InternStatusTable from '@/components/coordinator/InternStatusTable';

/**
 * Full, paginated interns list — the "View all N interns" destination from the
 * coordinator dashboard. Reuses the same sortable/filterable table component.
 * Honours an `?attention=1` query param so the dashboard "Needs Attention" count
 * card can deep-link straight to the flagged interns (item 13).
 */
export default function InternsList() {
  const [params] = useSearchParams();
  const attentionOnly = params.get('attention') === '1';

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--h-15157d)]">Coordinator</p>
        <h2 className="text-3xl font-bold tracking-tight text-[var(--h-0b1c30)]">
          {attentionOnly ? 'Interns needing attention' : 'All Interns'}
        </h2>
        <p className="mt-1 text-sm text-[var(--h-757684)]">Sort, filter, and drill into every active placement.</p>
      </div>
      <InternStatusTable pageSize={20} initialFilters={attentionOnly ? { attention: true } : undefined} />
    </div>
  );
}
