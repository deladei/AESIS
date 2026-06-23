import { useState } from 'react';
import { Target, Plus, Loader2 } from 'lucide-react';
import { useObjectives, useDefineObjective } from '@/hooks/useObjectives';

/**
 * Per-placement learning-objectives panel. Lists each objective with its
 * confirmed-entry progress; when `canDefine`, the academic supervisor can add
 * new objectives. Read-only otherwise.
 */
export function ObjectivesPanel({ placementId, canDefine = false }: { placementId: string; canDefine?: boolean }) {
  const { data: objectives = [], isLoading } = useObjectives(placementId);
  const define = useDefineObjective(placementId);
  const [title, setTitle] = useState('');

  function add() {
    const t = title.trim();
    if (!t || define.isPending) return;
    define.mutate({ title: t }, { onSuccess: () => setTitle('') });
  }

  return (
    <section className="rounded-xl bg-[var(--h-ffffff)] p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-[var(--h-15157d)]" />
        <h3 className="text-sm font-bold text-[var(--h-0b1c30)]">Learning objectives</h3>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" />
      ) : objectives.length === 0 ? (
        <p className="text-sm text-[var(--h-757684)]">No objectives defined yet.</p>
      ) : (
        <ul className="space-y-3">
          {objectives.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--h-0b1c30)]">{o.title}</p>
                {o.description && <p className="text-xs text-[var(--h-757684)]">{o.description}</p>}
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded-full bg-[var(--h-eef1ff)] px-2 py-0.5 text-xs font-semibold text-[var(--h-15157d)]">
                  {o.confirmedEntryCount} {o.confirmedEntryCount === 1 ? 'entry' : 'entries'}
                </span>
                {o.suggestedEntryCount > 0 && (
                  <p className="mt-1 text-[10px] font-medium text-[var(--h-9a6700)]">
                    {o.suggestedEntryCount} awaiting confirmation
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canDefine && (
        <div className="mt-5 flex gap-2 border-t border-[var(--h-eef1ff)] pt-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add an objective…"
            maxLength={200}
            className="flex-1 rounded-lg border border-[var(--h-c4c5d5)] px-3 py-2 text-sm outline-none focus:border-[var(--h-15157d)] focus:ring-2 focus:ring-[var(--h-e1e0ff)]"
          />
          <button
            onClick={add}
            disabled={!title.trim() || define.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:bg-[var(--h-c4c5d5)]"
          >
            {define.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
      )}
      {define.isError && (
        <p className="mt-2 text-xs font-medium text-[var(--h-8a1c1c)]">Couldn't add the objective — try again.</p>
      )}
    </section>
  );
}
