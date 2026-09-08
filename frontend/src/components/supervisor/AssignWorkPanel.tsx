import { useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, FileText, Loader2, Paperclip, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAssignWork, type TaskCategory } from '@/hooks/useTasks';
import { Card, CardHeader } from '@/components/ui/Card';

export interface AssignableStudent {
  id:        string;
  firstName: string;
  lastName:  string;
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'report',  label: 'Report' },
  { value: 'review',  label: 'Review' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'admin',   label: 'Admin' },
  { value: 'other',   label: 'Other' },
];

/** Matches the server's multer limits exactly, so nothing is rejected after upload. */
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg,.webp';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Set one piece of work for several supervised students at once.
 *
 * The student list is the supervisor's own, passed in from the dashboard rather
 * than fetched again — it is already on screen, and a second request would be a
 * second answer to the same question that could disagree with the first.
 *
 * Deliberately supervisor-to-student only. A student's own work goes back
 * through the logbook, which already has attachments and an acknowledge/return
 * workflow behind it; a second, review-less place to file student work would
 * mean two places to look for it.
 */
export default function AssignWorkPanel({ students }: { students: AssignableStudent[] }) {
  const assign = useAssignWork();
  const fileRef = useRef<HTMLInputElement>(null);

  // Two explicit modes rather than a "select all" shortcut. "Everyone" is the
  // common case and should not require ticking a list; and a supervisor who
  // means everyone should not have to check the count matched.
  const [mode,        setMode]        = useState<'all' | 'some'>('all');
  const [selected,    setSelected]    = useState<string[]>([]);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<TaskCategory>('report');
  const [dueDate,     setDueDate]     = useState('');
  const [dueTime,     setDueTime]     = useState('17:00');
  const [files,       setFiles]       = useState<File[]>([]);
  const [error,       setError]       = useState('');
  const [done,        setDone]        = useState(0);

  const sorted = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [students],
  );

  // Resolved at submit time, not when the mode is chosen: "everyone" should
  // mean everyone the supervisor has when they press the button.
  const recipients = mode === 'all' ? sorted.map((s) => s.id) : selected;
  const canSubmit  = recipients.length > 0 && title.trim().length >= 3 && !assign.isPending;

  function toggle(id: string) {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const incoming = Array.from(picked);

    // Checked here as well as on the server so the person is told before a
    // 10 MB upload runs and fails.
    const tooBig = incoming.find((f) => f.size > MAX_BYTES);
    if (tooBig) { setError(`"${tooBig.name}" is larger than 10 MB.`); return; }
    if (files.length + incoming.length > MAX_FILES) {
      setError(`Attach at most ${MAX_FILES} files.`); return;
    }

    setError('');
    setFiles((cur) => [...cur, ...incoming]);
  }

  async function submit() {
    setError('');
    setDone(0);
    try {
      // Date and time are collected separately because a deadline has both, and
      // a native datetime-local is inconsistent across browsers. Combined into
      // one instant here; without a time the server would store midnight, which
      // silently means "the day before" to anyone working that evening.
      const dueAt = dueDate ? new Date(`${dueDate}T${dueTime || '17:00'}`).toISOString() : undefined;

      const res = await assign.mutateAsync({
        assigneeIds: recipients,
        title:       title.trim(),
        description: description.trim() || undefined,
        category,
        dueAt,
        files,
      });

      setDone(res.created);
      // The mode is left alone: setting several things for the same group is
      // the normal rhythm, and resetting it every time would fight the user.
      setSelected([]); setTitle(''); setDescription(''); setDueDate(''); setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      setError(message ?? 'Could not set the work. Please try again.');
    }
  }

  if (students.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Assign work"
        subtitle="Set a task for the students you supervise, with a brief or template attached."
      />

      <div className="space-y-4 px-5 pb-5">
        {/* Who gets it */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
            <Users className="h-3.5 w-3.5" /> Who gets this
          </label>

          <div role="radiogroup" aria-label="Who gets this" className="flex gap-2">
            {([
              ['all',  `All my students (${students.length})`],
              ['some', 'Choose students'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                  mode === value
                    ? 'border-brand bg-brand-soft text-brand-ink'
                    : 'border-line text-ink-secondary hover:bg-surface-sunken',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'some' && (
            <>
              <div className="mb-1.5 mt-3 flex items-center justify-between">
                <span className="text-xs text-ink-muted">
                  {selected.length === 0
                    ? 'Nobody selected yet.'
                    : `${selected.length} of ${students.length} selected`}
                </span>
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="text-xs font-semibold text-brand-ink hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line p-2">
                {sorted.map((s) => {
                  const on = selected.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      aria-pressed={on}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        on ? 'border-brand bg-brand text-white'
                           : 'border-line text-ink-secondary hover:bg-surface-sunken',
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {s.firstName} {s.lastName}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div>
          <label htmlFor="assign-title" className="mb-1.5 block text-sm font-medium text-ink-muted">Title</label>
          <input
            id="assign-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="e.g. Week 4 progress report"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <label htmlFor="assign-desc" className="mb-1.5 block text-sm font-medium text-ink-muted">
            Instructions <span className="text-ink-muted">(optional)</span>
          </label>
          <textarea
            id="assign-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="What the student needs to do, and what good looks like."
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="assign-cat" className="mb-1.5 block text-sm font-medium text-ink-muted">Category</label>
            <select
              id="assign-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskCategory)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="assign-date" className="mb-1.5 block text-sm font-medium text-ink-muted">Due date</label>
            <input
              id="assign-date" type="date" value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="assign-time" className="mb-1.5 block text-sm font-medium text-ink-muted">Due time</label>
            <input
              id="assign-time" type="time" value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={!dueDate}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
            />
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">
            Brief or template <span className="text-ink-muted">(optional)</span>
          </label>
          <input
            ref={fileRef} type="file" multiple accept={ACCEPT}
            onChange={(e) => addFiles(e.target.files)}
            className="block w-full text-sm text-ink-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-line"
          />
          <p className="mt-1 text-xs text-ink-muted">
            PDF, DOCX, PNG, JPEG or WebP. Up to {MAX_FILES} files, 10 MB each. Uploaded once
            and shared with everyone you select.
          </p>

          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg bg-surface-sunken px-2.5 py-1.5 text-xs text-ink">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-ink-muted">{humanSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((cur) => cur.filter((_, n) => n !== i))}
                    aria-label={`Remove ${f.name}`}
                    className="shrink-0 rounded p-0.5 text-ink-muted hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {done > 0 && !error && (
          <p className="rounded-lg border border-ok bg-ok-soft px-3 py-2 text-sm text-ink">
            Work set for {done} student{done === 1 ? '' : 's'}.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            {files.length > 0 && <><Paperclip className="h-3.5 w-3.5" /> {files.length} attached</>}
            {dueDate && <><CalendarClock className="ml-2 h-3.5 w-3.5" /> due {dueDate} {dueTime}</>}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {assign.isPending
              ? 'Setting work…'
              : mode === 'all'
                ? `Assign to all ${students.length}`
                : `Assign${selected.length ? ` to ${selected.length}` : ''}`}
          </button>
        </div>
      </div>
    </Card>
  );
}
