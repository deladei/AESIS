import { useRef, useState } from 'react';
import {
  Upload, FileText, Check, X, AlertCircle, Loader2, Download,
  GraduationCap, ChevronDown, ChevronUp, UserCheck,
} from 'lucide-react';
import {
  useStudentRoster, useUploadStudentRoster, type RosterUploadResponse,
} from '@/hooks/usePlacements';
import { fileToCells, UPLOAD_ACCEPT } from '@/lib/tabular';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParsedRow {
  firstName: string;
  lastName: string;
  email: string;
  indexNumber: string | null;
  valid: boolean;
  problem?: string;
}

// Validate raw cell rows into roster rows: firstName, lastName, email, indexNumber?
function rowsFromCells(cells: string[][]): ParsedRow[] {
  const nonEmpty = cells.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const first = nonEmpty[0].join(',').toLowerCase();
  const start = first.includes('email') || first.includes('index') ? 1 : 0;
  return nonEmpty.slice(start).map((row) => {
    const [firstName = '', lastName = '', email = '', indexRaw = ''] = row.map((c) => c.trim());
    let problem: string | undefined;
    if (!firstName || !lastName) problem = 'Missing name';
    else if (!EMAIL_RE.test(email)) problem = 'Invalid email';
    return { firstName, lastName, email, indexNumber: indexRaw || null, valid: !problem, problem };
  });
}

const TEMPLATE =
  'firstName,lastName,email,indexNumber\n' +
  'Abena,Boateng,abena.boateng@st.uni.edu.gh,CS/2023/0114\n' +
  'Kwame,Asante,kwame.asante@st.uni.edu.gh,CS/2023/0087\n';

/**
 * Class roster upload — the coordinator loads the student list up front so
 * that when a student lands a placement and creates an account, the system
 * already knows them (matched by email or index number, auto-verified).
 */
export default function StudentRosterPanel() {
  const { data: roster, isLoading: rosterLoading } = useStudentRoster();
  const upload = useUploadStudentRoster();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<RosterUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const valid = rows.filter((r) => r.valid);
  const invalid = rows.length - valid.length;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null); setResult(null);
    try {
      const parsed = rowsFromCells(await fileToCells(file));
      if (parsed.length === 0) { setError('No rows found in that file.'); setRows([]); setFileName(null); return; }
      setRows(parsed);
      setFileName(file.name);
    } catch {
      setError("Couldn't read that file — use CSV, TSV, TXT, Excel (.xlsx) or ODS.");
      setRows([]); setFileName(null);
    }
  };

  const onUpload = () => {
    setError(null);
    upload.mutate(
      valid.map((r) => ({ firstName: r.firstName, lastName: r.lastName, email: r.email, indexNumber: r.indexNumber })),
      {
        onSuccess: (res) => { setResult(res); setRows([]); setFileName(null); },
        onError: () => setError('Upload failed — please try again.'),
      },
    );
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'class-roster-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-brand-ink" />
        <h2 className="text-sm font-bold text-ink">Upload class roster</h2>
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Load the student list before internships start. Accepts CSV, Excel (.xlsx/.xls), TSV or plain text.
        Columns: <span className="font-mono">firstName, lastName, email, indexNumber</span> (index number optional).
        When a listed student creates their account — matched by email or index number — the system recognises
        them automatically and they can start logging straight away.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" className="hidden" onChange={onPick} accept={UPLOAD_ACCEPT} />
        <button
          type="button" onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Upload className="h-4 w-4" /> Choose file
        </button>
        <button
          type="button" onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          <Download className="h-4 w-4" /> Template
        </button>
        {fileName && (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <FileText className="h-3.5 w-3.5" /> {fileName}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      {/* Parsed preview */}
      {rows.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">
              {valid.length} ready{invalid > 0 && <span className="text-danger"> · {invalid} need fixing</span>}
            </span>
            <button
              type="button" onClick={onUpload} disabled={valid.length === 0 || upload.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-ok px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-line-strong"
            >
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Add {valid.length} student{valid.length === 1 ? '' : 's'}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      {r.valid
                        ? <Check className="h-4 w-4 text-ok" />
                        : <X className="h-4 w-4 text-danger" />}
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">{r.firstName} {r.lastName}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.email}</td>
                    <td className="px-3 py-2 text-ink-muted">
                      {r.problem
                        ? <span className="text-danger">{r.problem}</span>
                        : <span className="font-mono text-xs">{r.indexNumber ?? '—'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result summary */}
      {result && (
        <div className="mt-4 rounded-lg border border-ok bg-ok-soft p-4 text-sm">
          <p className="font-semibold text-ok">
            {result.created} added · {result.updated} updated
            {result.linked > 0 && ` · ${result.linked} matched existing accounts`}
            {result.skipped > 0 && ` · ${result.skipped} skipped`}
          </p>
          {result.skipped > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-ink-muted">
              {result.results.filter((r) => r.status === 'skipped').map((r) => (
                <li key={r.email}>{r.email} — {r.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Current roster */}
      {!rosterLoading && roster && roster.total > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <button
            type="button" onClick={() => setShowList((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-xs font-semibold text-ink">
              Class roster · {roster.total} student{roster.total === 1 ? '' : 's'} ·{' '}
              <span className="text-ok">{roster.registered} registered</span>
              {roster.total - roster.registered > 0 && (
                <span className="text-ink-muted"> · {roster.total - roster.registered} awaiting signup</span>
              )}
            </span>
            {showList ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
          </button>
          {showList && (
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <tbody>
                  {roster.rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-medium text-ink">{r.firstName} {r.lastName}</td>
                      <td className="px-3 py-2 text-ink-muted">{r.email}</td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-muted">{r.indexNumber ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {r.registered ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">
                            <UserCheck className="h-3 w-3" /> Registered
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                            Awaiting signup
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
