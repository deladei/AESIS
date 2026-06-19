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

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Upload failed. Please try again.';

/**
 * Image/document evidence for a weekly entry. Images render as thumbnails,
 * documents as file chips; both open in a new tab. Upload + delete show only
 * while the entry is editable (draft/returned) — the API enforces it too.
 */
export function EntryAttachments({
  entryId, editable = true,
}: {
  entryId: string;
  editable?: boolean;
}) {
  const { data: attachments = [], isLoading } = useEntryAttachments(entryId);
  const upload = useUploadAttachment(entryId);
  const remove = useDeleteAttachment(entryId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

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
      await upload.mutateAsync(file);
    } catch (err) {
      setError(apiErr(err));
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#0b1c30]">
            <Paperclip className="h-4 w-4 text-[#8a4cfc]" /> Attachments
          </h3>
          <p className="text-xs text-[#64748b]">Photos or documents as evidence for this week</p>
        </div>
        {editable && (
          <>
            <input
              ref={fileInput} type="file" accept={ACCEPT} className="hidden"
              onChange={onPick}
            />
            <button
              type="button" onClick={() => fileInput.current?.click()} disabled={upload.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-[#f1ecff] px-3 py-1.5 text-sm font-medium text-[#712ae2] transition-colors hover:bg-[#e6dcff] disabled:opacity-50"
            >
              {upload.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                : <><Upload className="h-4 w-4" /> Add file</>}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#f5b8ad] bg-[#fff1ee] px-3 py-2 text-xs text-[#b3261e]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#8a4cfc]" />
        </div>
      ) : attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d8dce6] py-6 text-center text-sm text-[#94a3b8]">
          {editable ? 'No files yet — add a photo or document.' : 'No files attached.'}
        </p>
      ) : (
        <div className="space-y-4">
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((a) => (
                <ImageTile key={a.id} a={a} editable={editable}
                  onDelete={() => remove.mutate(a.id)} deleting={remove.isPending} />
              ))}
            </div>
          )}
          {docs.length > 0 && (
            <ul className="space-y-2">
              {docs.map((a) => (
                <DocRow key={a.id} a={a} editable={editable}
                  onDelete={() => remove.mutate(a.id)} deleting={remove.isPending} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ImageTile({ a, editable, onDelete, deleting }: {
  a: EntryAttachment; editable: boolean; onDelete: () => void; deleting: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-[#e2e6ef]">
      <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" title={a.fileName}>
        <img src={a.fileUrl} alt={a.fileName} className="h-28 w-full object-cover" />
      </a>
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

function DocRow({ a, editable, onDelete, deleting }: {
  a: EntryAttachment; editable: boolean; onDelete: () => void; deleting: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-[#e8ebf2] bg-[#fbfcfe] px-3 py-2">
      <FileText className="h-5 w-5 shrink-0 text-[#712ae2]" />
      <a
        href={a.fileUrl} target="_blank" rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-sm font-medium text-[#15157d] hover:underline"
        title={a.fileName}
      >
        {a.fileName}
      </a>
      <span className="shrink-0 text-xs text-[#64748b]">{fmtBytes(a.fileSize)}</span>
      {editable && (
        <button
          type="button" onClick={onDelete} disabled={deleting} aria-label={`Remove ${a.fileName}`}
          className="shrink-0 rounded-md p-1.5 text-[#94a3b8] transition-colors hover:bg-[#ffe2dc] hover:text-[#b3261e] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
