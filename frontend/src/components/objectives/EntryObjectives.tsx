import { Target, Check, Sparkles, Loader2 } from 'lucide-react';
import {
  useObjectives, useEntryObjectives,
  useAddEntryObjectives, useConfirmEntryObjective, useRemoveEntryObjective,
} from '@/hooks/useObjectives';

/**
 * Maps the current weekly entry to its placement's learning objectives.
 * Click an unlinked objective to map it (counts immediately); an AI-suggested
 * objective shows distinctly and must be explicitly confirmed before it counts.
 * Read-only when the entry is locked.
 */
export function EntryObjectives({
  entryId, placementId, editable = true,
}: {
  entryId: string;
  placementId?: string;
  editable?: boolean;
}) {
  const { data: objectives = [] } = useObjectives(placementId);
  const { data: links = [] }      = useEntryObjectives(entryId);
  const add     = useAddEntryObjectives(entryId, placementId);
  const confirm = useConfirmEntryObjective(entryId, placementId);
  const remove  = useRemoveEntryObjective(entryId, placementId);

  const busy = add.isPending || confirm.isPending || remove.isPending;
  const linkByObj = new Map(links.map((l) => [l.objectiveId, l]));

  if (objectives.length === 0) return null;

  function onClick(objectiveId: string) {
    if (!editable || busy) return;
    const link = linkByObj.get(objectiveId);
    if (!link) add.mutate([objectiveId]);
    else if (link.status === 'suggested') confirm.mutate(objectiveId);
    else remove.mutate(objectiveId);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Target className="h-4 w-4 text-[#15157d]" />
        <p className="text-sm font-semibold text-[#0b1c30]">Learning objectives</p>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#15157d]" />}
      </div>
      <div className="flex flex-wrap gap-2">
        {objectives.map((o) => {
          const link = linkByObj.get(o.id);
          const confirmed = link?.status === 'confirmed';
          const suggested = link?.status === 'suggested';

          const cls = confirmed
            ? 'bg-[#15157d] text-white border-[#15157d]'
            : suggested
              ? 'border-dashed border-[#9a6700] bg-[#fff4e0] text-[#9a6700]'
              : 'border-[#c4c5d5] bg-white text-[#444653] hover:border-[#15157d]';

          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onClick(o.id)}
              disabled={!editable || busy}
              title={
                suggested ? 'AI suggestion — click to confirm'
                : confirmed ? 'Mapped — click to remove'
                : 'Click to map this objective'
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default ${cls}`}
            >
              {confirmed && <Check className="h-3 w-3" />}
              {suggested && <Sparkles className="h-3 w-3" />}
              {o.title}
              {suggested && <span className="font-semibold"> · confirm</span>}
            </button>
          );
        })}
      </div>
      {links.some((l) => l.status === 'suggested') && editable && (
        <p className="mt-2 text-xs text-[#757684]">
          <Sparkles className="mr-1 inline h-3 w-3 text-[#9a6700]" />
          AI-suggested objectives don't count until you confirm them.
        </p>
      )}
    </div>
  );
}
