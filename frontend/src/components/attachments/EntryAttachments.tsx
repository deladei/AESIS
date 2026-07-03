import { useRef, useState } from 'react';
import { Paperclip, Upload, FileText, X, Loader2, AlertCircle } from 'lucide-react';
import {
  useEntryAttachments, useUploadAttachment, useDeleteAttachment,
  type EntryAttachment,
} from '@/hooks/useAttachments';

// Accept-list mirrors the backend multer fileFilter (PDF / PNG / JPG / DOCX),
// 10 MB cap. The `accept` attribute is a hint only; the API is the real gate.
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 10 * 1024 * 1024;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Short day label ("Mon 6 Jul") for the week-wide (supervisor) view.
function fmtDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Upload failed. Please try again.';

/**
 * Image/document evidence. With `date` set (the student's day editor), only
 * that day's files show and uploads are stamped to that day — each day's log
 * carries its own files, like attachments on an email. Without `date` (the
 * supervisor review), every file of the week shows, tagged with its day.
 * Upload + delete show only while the day is editable — the API enforces it too.
 */
export function EntryAttachments({
  entryId, date, editable = true,
}: {
  entryId: string;
  date?: string; // YYYY-MM-DD — scope to one working day
  editable?: boolean;
}) {
  const { data: all = [], isLoading } = useEntryAttachments(entryId);
  const upload = useUploadAttachment(entryId);
  const remove = useDeleteAttachment(entryId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const attachments = date ? all.filter((a) => a.dayDate?.slice(0, 10) === date) : all;
  const images = attachments.filter((a) => a.kind === 'image');
  const docs = attachments.filter((a) => a.kind === 'document');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('That file is larger than the 10 MB limit.');
      return;
    }
    try {
      await upload.mutateAsync({ file, date });
    } catch (err) {
      setError(apiErr(err));
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--h-0b1c30)]">
            <Paperclip className="h-4 w-4 text-[var(--h-8a4cfc)]" /> Attachments
          </h3>
          <p className="text-xs text-[var(--h-64748b)]">
            {date ? 'Photos or documents as evidence for this day' : 'Photos or documents as evidence for this week'}
          </p>
        </div>
        {editable && (
          <>
            <input
              ref={fileInput} type="file" accept={ACCEPT} className="hidden"
              onChange={onPick}
            />
            <button
              type="button" onClick={() => fileInput.current?.click()} disabled={upload.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--h-f1ecff)] px-3 py-1.5 text-sm font-medium text-[var(--h-712ae2)] transition-colors hover:bg-[var(--h-e6dcff)] disabled:opacity-50"
            >
              {upload.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                : <><Upload className="h-4 w-4" /> Add file</>}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--h-f5b8ad)] bg-[var(--h-fff1ee)] px-3 py-2 text-xs text-[var(--h-b3261e)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--h-8a4cfc)]" />
        </div>
      ) : attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--h-d8dce6)] py-6 text-center text-sm text-[var(--h-94a3b8)]">
          {editable ? 'No files yet — add a photo or document.' : 'No files attached.'}
        </p>
      ) : (
        <div className="space-y-4">
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((a) => (
                <ImageTile key={a.id} a={a} editable={editable} showDay={!date}
                  onDelete={() => remove.mutate(a.id)} deleting={remove.isPending} />
              ))}
            </div>
          )}
          {docs.length > 0 && (
            <ul className="space-y-2">
              {docs.map((a) => (
                <DocRow key={a.id} a={a} editable={editable} showDay={!date}
                  onDelete={() => remove.mutate(a.id)} deleting={remove.isPending} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ImageTile({ a, editable, showDay, onDelete, deleting }: {
  a: EntryAttachment; editable: boolean; showDay: boolean; onDelete: () => void; deleting: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-[var(--h-e2e6ef)]">
      <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" title={a.fileName}>
        <img src={a.fileUrl} alt={a.fileName} className="h-28 w-full object-cover" />
      </a>
      {showDay && a.dayDate && (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {fmtDay(a.dayDate)}
        </span>
      )}
      {editable && (
        <button
          type="button" onClick={onDelete} disabled={deleting} aria-label={`Remove ${a.fileName}`}
          className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function DocRow({ a, editable, showDay, onDelete, deleting }: {
  a: EntryAttachment; editable: boolean; showDay: boolean; onDelete: () => void; deleting: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-[var(--h-e8ebf2)] bg-[var(--h-fbfcfe)] px-3 py-2">
      <FileText className="h-5 w-5 shrink-0 text-[var(--h-712ae2)]" />
      <a
        href={a.fileUrl} target="_blank" rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--h-15157d)] hover:underline"
        title={a.fileName}
      >
        {a.fileName}
      </a>
      {showDay && a.dayDate && (
        <span className="shrink-0 rounded bg-[var(--h-eef0f5)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--h-64748b)]">
          {fmtDay(a.dayDate)}
        </span>
      )}
      <span className="shrink-0 text-xs text-[var(--h-64748b)]">{fmtBytes(a.fileSize)}</span>
      {editable && (
        <button
          type="button" onClick={onDelete} disabled={deleting} aria-label={`Remove ${a.fileName}`}
          className="shrink-0 rounded-md p-1.5 text-[var(--h-94a3b8)] transition-colors hover:bg-[var(--h-ffe2dc)] hover:text-[var(--h-b3261e)] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
