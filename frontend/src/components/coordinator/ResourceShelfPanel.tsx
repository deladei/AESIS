import { useRef, useState } from 'react';
import {
  BookOpen, Upload, Link2, FileText, Loader2, Trash2, Eye, EyeOff, Plus, X,
} from 'lucide-react';
import {
  useManagedResources, useCreateResource, useUploadResource,
  useSetResourcePublished, useArchiveResource, formatFileSize,
  type Resource, type ResourceCategory, type ResourceAudience,
} from '@/hooks/useResources';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, SkeletonRows } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

// Same accept-list and cap the API enforces (multer fileFilter, 10 MB). The
// attribute is a hint; the server is the gate.
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 10 * 1024 * 1024;

const CATEGORIES: { value: ResourceCategory; label: string }[] = [
  { value: 'guideline', label: 'Guideline' },
  { value: 'template',  label: 'Template' },
  { value: 'rubric',    label: 'Rubric' },
  { value: 'policy',    label: 'Policy' },
  { value: 'form',      label: 'Form' },
  { value: 'sample',    label: 'Sample' },
  { value: 'other',     label: 'Other' },
];

// Audiences a coordinator actually publishes to. Roles are stored on the row,
// so a rubric aimed at supervisors never reaches a student's dashboard.
const AUDIENCES: { value: ResourceAudience; label: string }[] = [
  { value: 'student',             label: 'Students' },
  { value: 'academic_supervisor', label: 'Academic supervisors' },
  { value: 'company_supervisor',  label: 'Company supervisors' },
  { value: 'coordinator',         label: 'Coordinators' },
];

const categoryLabel = (c: ResourceCategory) =>
  CATEGORIES.find((x) => x.value === c)?.label ?? 'Other';

const audienceLabel = (r: ResourceAudience) =>
  AUDIENCES.find((x) => x.value === r)?.label ?? r.replace(/_/g, ' ');

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message)
  ?? 'Something went wrong. Please try again.';

/**
 * The shelf a coordinator publishes to — written guidance, links and documents
 * that land on the reader's dashboard ("Quick resources" for a student).
 *
 * A card may be any combination of the three: a typed notice with no file, a
 * document with no commentary, a link with a line explaining it. That is why
 * the composer does not ask which KIND of resource is being made — it asks what
 * there is to say, and publishes whatever was filled in.
 */
export default function ResourceShelfPanel() {
  const { data: resources = [], isLoading } = useManagedResources();
  const create = useCreateResource();
  const upload = useUploadResource();
  const setPublished = useSetResourcePublished();
  const archive = useArchiveResource();

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [category, setCategory] = useState<ResourceCategory>('guideline');
  const [audience, setAudience] = useState<ResourceAudience[]>(['student']);
  const [publishNow, setPublishNow] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = create.isPending || upload.isPending;
  const canPost = title.trim().length >= 3
    && audience.length > 0
    && (!!body.trim() || !!externalUrl.trim() || !!file);

  function reset() {
    setTitle(''); setDescription(''); setBody(''); setExternalUrl('');
    setCategory('guideline'); setAudience(['student']); setPublishNow(true);
    setFile(null); setError(null);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after a failure
    if (!picked) return;
    if (picked.size > MAX_BYTES) { setError('That file is over 10 MB.'); return; }
    setError(null);
    setFile(picked);
  }

  async function post() {
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      body: body.trim() || undefined,
      externalUrl: externalUrl.trim() || undefined,
      category,
      audienceRoles: audience,
      isPublished: publishNow,
    };
    try {
      if (file) await upload.mutateAsync({ ...payload, file });
      else await create.mutateAsync(payload);
      reset();
      setComposing(false);
    } catch (e) {
      setError(apiErr(e));
    }
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 pb-0">
        <CardHeader
          title="Resources for students"
          subtitle="Guidance, links and documents. Published cards appear on the reader's dashboard."
          control={
            <button
              type="button"
              onClick={() => { setComposing((v) => !v); setError(null); }}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                composing
                  ? 'border border-line text-ink-secondary hover:bg-surface-sunken'
                  : 'bg-brand text-ink-inverse hover:opacity-90',
              )}
            >
              {composing ? <><X className="h-3.5 w-3.5" /> Close</> : <><Plus className="h-3.5 w-3.5" /> New resource</>}
            </button>
          }
        />
      </div>

      {composing && (
        <div className="mx-5 mb-5 rounded-card border border-line bg-surface-sunken p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">Title</span>
              <input
                value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
                placeholder="Logbook writing guidelines"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">Category</span>
              <select
                value={category} onChange={(e) => setCategory(e.target.value as ResourceCategory)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">Summary line</span>
              <input
                value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000}
                placeholder="What this is, in one line"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">
                Written guidance <span className="font-normal text-ink-muted">— optional, shown in full on the card</span>
              </span>
              <textarea
                rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000}
                placeholder="Type the notice or instructions students should read."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">Link</span>
              <input
                value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} maxLength={2000}
                placeholder="https://…"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </label>

            <div>
              <span className="mb-1 block text-xs font-semibold text-ink-secondary">Document</span>
              <div className="flex items-center gap-2">
                <button
                  type="button" onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
                >
                  <Upload className="h-3.5 w-3.5" /> Choose file
                </button>
                {file && (
                  <span className="flex min-w-0 items-center gap-1 text-xs text-ink-secondary">
                    <span className="truncate">{file.name}</span>
                    <button type="button" onClick={() => setFile(null)} aria-label="Remove file">
                      <X className="h-3.5 w-3.5 text-ink-muted hover:text-danger" />
                    </button>
                  </span>
                )}
                <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={pickFile} />
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">PDF, PNG, JPG or DOCX · up to 10 MB</p>
            </div>

            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-ink-secondary">Who sees it</span>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => {
                  const on = audience.includes(a.value);
                  return (
                    <button
                      key={a.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAudience((prev) => (
                        on ? prev.filter((r) => r !== a.value) : [...prev, a.value]
                      ))}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        on
                          ? 'border-brand bg-brand-soft text-brand-ink'
                          : 'border-line bg-surface text-ink-secondary hover:border-brand',
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-danger">{error}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-secondary">
              <input
                type="checkbox" checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line accent-brand"
              />
              Publish now. Leave unticked to save it and release it later.
            </label>
            <button
              type="button" onClick={post} disabled={!canPost || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {file ? 'Upload and post' : 'Post resource'}
            </button>
          </div>
          {!canPost && title.trim().length >= 3 && (
            <p className="mt-2 text-[11px] text-ink-muted">
              Add written guidance, a link or a document — a card with none of the three reaches nobody.
            </p>
          )}
        </div>
      )}

      <div className="px-5 pb-5">
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : resources.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Nothing on the shelf yet"
            hint="Post guidance, a link or a document and it appears on your students' dashboards."
            className="py-8"
          />
        ) : (
          // Bento: a written notice earns a wider tile because it is read on the
          // spot; a link or a file is a one-line errand and takes a small one.
          <div className="grid auto-rows-[minmax(0,auto)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {resources.map((r) => (
              <ResourceTile
                key={r.id}
                resource={r}
                wide={!!r.body && r.body.length > 180}
                onTogglePublish={() => setPublished.mutate({ id: r.id, isPublished: !r.isPublished })}
                onArchive={() => archive.mutate(r.id)}
                busy={
                  (setPublished.isPending && setPublished.variables?.id === r.id)
                  || (archive.isPending && archive.variables === r.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ResourceTile({
  resource: r, wide, onTogglePublish, onArchive, busy,
}: {
  resource: Resource;
  wide: boolean;
  onTogglePublish: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const href = r.externalUrl ?? r.fileUrl;

  return (
    <div className={cn(
      'flex flex-col rounded-card border border-line bg-surface p-4',
      wide && 'sm:col-span-2',
      !r.isPublished && 'border-dashed',
    )}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{r.title}</h3>
        <Badge tone={r.isPublished ? 'ok' : 'neutral'}>
          {r.isPublished ? 'Published' : 'Hidden'}
        </Badge>
      </div>

      {r.description && <p className="mb-2 text-xs text-ink-secondary">{r.description}</p>}

      {r.body && (
        <p className={cn(
          'mb-3 whitespace-pre-wrap text-sm leading-relaxed text-ink',
          !wide && 'line-clamp-6',
        )}>
          {r.body}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="info">{categoryLabel(r.category)}</Badge>
        {(r.audienceRoles ?? []).map((a) => (
          <span key={a} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
            {audienceLabel(a)}
          </span>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {href && (
          <a
            href={href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink hover:underline"
          >
            {r.fileUrl ? <FileText className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {r.fileUrl ? 'Open document' : 'Open link'}
            {r.fileSize ? <span className="font-normal text-ink-muted">{formatFileSize(r.fileSize)}</span> : null}
          </a>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button" onClick={onTogglePublish} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken disabled:opacity-50"
          >
            {r.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {r.isPublished ? 'Hide' : 'Publish'}
          </button>
          {confirming ? (
            <span className="flex items-center gap-1">
              <button
                type="button" onClick={onArchive} disabled={busy}
                className="rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold text-ink-inverse disabled:opacity-50"
              >
                {busy ? 'Removing…' : 'Remove'}
              </button>
              <button
                type="button" onClick={() => setConfirming(false)}
                className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-ink-secondary"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button" onClick={() => setConfirming(true)}
              aria-label={`Remove ${r.title}`}
              className="rounded-lg border border-line p-1 text-ink-muted transition-colors hover:border-danger hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
