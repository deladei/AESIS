import InternStatusTable from '@/components/coordinator/InternStatusTable';

/**
 * Full, paginated interns list — the "View all N interns" destination from the
 * coordinator dashboard. Reuses the same sortable/filterable table component.
 */
export default function InternsList() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold tracking-wide text-[#15157d]">Coordinator</p>
        <h2 className="text-3xl font-bold tracking-tight text-[#0b1c30]">All Interns</h2>
        <p className="mt-1 text-sm text-[#757684]">Sort, filter, and drill into every active placement.</p>
      </div>
      <InternStatusTable pageSize={20} />
    </div>
  );
}
