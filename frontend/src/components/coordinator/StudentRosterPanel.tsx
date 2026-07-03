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
      setError("Couldn't read that file — use CSV, TSV, TXT or Excel (.xlsx).");
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
    <section className="rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-6">
      <div className="mb-1 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-[var(--h-15157d)]" />
        <h2 className="text-sm font-bold text-[var(--h-0b1c30)]">Upload class roster</h2>
      </div>
      <p className="mb-4 text-xs text-[var(--h-757684)]">
        Load the student list before internships start. Accepts CSV, Excel (.xlsx/.xls), TSV or plain text.
        Columns: <span className="font-mono">firstName, lastName, email, indexNumber</span> (index number optional).
        When a listed student creates their account — matched by email or index number — the system recognises
        them automatically and they can start logging straight away.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" className="hidden" onChange={onPick} accept={UPLOAD_ACCEPT} />
        <button
          type="button" onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Upload className="h-4 w-4" /> Choose file
        </button>
        <button
          type="button" onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5)] px-3 py-2 text-sm font-medium text-[var(--h-0b1c30)] hover:bg-[var(--h-f3f3f7)]"
        >
          <Download className="h-4 w-4" /> Template
        </button>
        {fileName && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--h-757684)]">
            <FileText className="h-3.5 w-3.5" /> {fileName}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--h-b3261e)]">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      {/* Parsed preview */}
      {rows.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--h-0b1c30)]">
              {valid.length} ready{invalid > 0 && <span className="text-[var(--h-b3261e)]"> · {invalid} need fixing</span>}
            </span>
            <button
              type="button" onClick={onUpload} disabled={valid.length === 0 || upload.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-1b7a45)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--h-c4c5d5)]"
            >
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Add {valid.length} student{valid.length === 1 ? '' : 's'}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--h-eef0f5)]">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--h-f5f6fa)] last:border-0">
                    <td className="px-3 py-2">
                      {r.valid
                        ? <Check className="h-4 w-4 text-[var(--h-1b7a45)]" />
                        : <X className="h-4 w-4 text-[var(--h-b3261e)]" />}
                    </td>
                    <td className="px-3 py-2 font-medium text-[var(--h-0b1c30)]">{r.firstName} {r.lastName}</td>
                    <td className="px-3 py-2 text-[var(--h-757684)]">{r.email}</td>
                    <td className="px-3 py-2 text-[var(--h-757684)]">
                      {r.problem
                        ? <span className="text-[var(--h-b3261e)]">{r.problem}</span>
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
        <div className="mt-4 rounded-lg border border-[var(--h-aee3c2)] bg-[var(--h-e9f9ef)] p-4 text-sm">
          <p className="font-semibold text-[var(--h-1b7a45)]">
            {result.created} added · {result.updated} updated
            {result.linked > 0 && ` · ${result.linked} matched existing accounts`}
            {result.skipped > 0 && ` · ${result.skipped} skipped`}
          </p>
          {result.skipped > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-[var(--h-757684)]">
              {result.results.filter((r) => r.status === 'skipped').map((r) => (
                <li key={r.email}>{r.email} — {r.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Current roster */}
      {!rosterLoading && roster && roster.total > 0 && (
        <div className="mt-5 border-t border-[var(--h-eef0f5)] pt-4">
          <button
            type="button" onClick={() => setShowList((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-xs font-semibold text-[var(--h-0b1c30)]">
              Class roster · {roster.total} student{roster.total === 1 ? '' : 's'} ·{' '}
              <span className="text-[var(--h-1b7a45)]">{roster.registered} registered</span>
              {roster.total - roster.registered > 0 && (
                <span className="text-[var(--h-757684)]"> · {roster.total - roster.registered} awaiting signup</span>
              )}
            </span>
            {showList ? <ChevronUp className="h-4 w-4 text-[var(--h-757684)]" /> : <ChevronDown className="h-4 w-4 text-[var(--h-757684)]" />}
          </button>
          {showList && (
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-[var(--h-eef0f5)]">
              <table className="w-full text-sm">
                <tbody>
                  {roster.rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--h-f5f6fa)] last:border-0">
                      <td className="px-3 py-2 font-medium text-[var(--h-0b1c30)]">{r.firstName} {r.lastName}</td>
                      <td className="px-3 py-2 text-[var(--h-757684)]">{r.email}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--h-757684)]">{r.indexNumber ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {r.registered ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--h-e9f9ef)] px-2 py-0.5 text-[11px] font-semibold text-[var(--h-1b7a45)]">
                            <UserCheck className="h-3 w-3" /> Registered
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--h-f3f3f7)] px-2 py-0.5 text-[11px] font-semibold text-[var(--h-757684)]">
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
