import { useState } from 'react';
import { Target, Plus, Loader2 } from 'lucide-react';
import { useObjectives, useDefineObjective } from '@/hooks/useObjectives';
import { freeText } from '@/lib/validation';
import { FieldError } from '@/components/shared/FieldError';

/**
 * Per-placement learning-objectives panel. Lists each objective with its
 * confirmed-entry progress; when `canDefine`, the academic supervisor can add
 * new objectives. Read-only otherwise.
 */
// `defineObjectiveSchema` — trimmed, non-empty, 200 max. `maxLength` alone
// truncated a long objective silently as it was typed.
const objectiveTitleRule = freeText(200, 'Objective');

export function ObjectivesPanel({ placementId, canDefine = false }: { placementId: string; canDefine?: boolean }) {
  const { data: objectives = [], isLoading } = useObjectives(placementId);
  const define = useDefineObjective(placementId);
  const [title, setTitle] = useState('');

  const titleCheck = title.trim() === '' ? null : objectiveTitleRule.safeParse(title);
  const titleError = titleCheck && !titleCheck.success ? titleCheck.error.issues[0]?.message : undefined;

  function add() {
    if (!titleCheck?.success || define.isPending) return;
    define.mutate({ title: titleCheck.data }, { onSuccess: () => setTitle('') });
  }

  return (
    <section className="rounded-xl bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-brand-ink" />
        <h3 className="text-sm font-bold text-ink">Learning objectives</h3>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-brand-ink" />
      ) : objectives.length === 0 ? (
        <p className="text-sm text-ink-muted">No objectives defined yet.</p>
      ) : (
        <ul className="space-y-3">
          {objectives.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{o.title}</p>
                {o.description && <p className="text-xs text-ink-muted">{o.description}</p>}
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-brand-ink">
                  {o.confirmedEntryCount} {o.confirmedEntryCount === 1 ? 'entry' : 'entries'}
                </span>
                {o.suggestedEntryCount > 0 && (
                  <p className="mt-1 text-[10px] font-medium text-warn">
                    {o.suggestedEntryCount} awaiting confirmation
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canDefine && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex gap-2">
          <input
            value={title}
            aria-invalid={!!titleError}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add an objective…"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
          />
          <button
            onClick={add}
            disabled={titleCheck?.success !== true || define.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-line-strong"
          >
            {define.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
          </div>
          <FieldError message={titleError} />
        </div>
      )}
      {define.isError && (
        <p className="mt-2 text-xs font-medium text-danger">Couldn't add the objective — try again.</p>
      )}
    </section>
  );
}
