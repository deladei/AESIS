import { useRef, useState } from 'react';
import { Upload, FileText, Check, X, AlertCircle, Loader2, Download, Users } from 'lucide-react';
import { useBulkCreateSupervisors, type BulkSupervisorResponse } from '@/hooks/usePlacements';
import { REGION_VALUES, REGION_LABELS } from '@/lib/regions';
import { fileToCells, UPLOAD_ACCEPT } from '@/lib/tabular';

// Region lookup accepting either the enum value (greater_accra) or the human
// label (Greater Accra), case/spacing-insensitive.
const REGION_BY_KEY = new Map<string, string>();
REGION_VALUES.forEach((v) => {
  REGION_BY_KEY.set(v, v);
  REGION_BY_KEY.set(REGION_LABELS[v].toLowerCase(), v);
});
function normalizeRegion(raw: string): string | null {
  const k = raw.trim().toLowerCase();
  if (REGION_BY_KEY.has(k)) return REGION_BY_KEY.get(k)!;
  const us = k.replace(/[\s-]+/g, '_');
  return REGION_BY_KEY.get(us) ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParsedRow {
  firstName: string;
  lastName: string;
  email: string;
  region: string | null;   // normalized enum value, or null if unrecognized
  rawRegion: string;
  valid: boolean;
  problem?: string;
}

// Validate raw cell rows (from any file type) into upload rows.
function rowsFromCells(cells: string[][]): ParsedRow[] {
  const nonEmpty = cells.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  // Skip a header row if present.
  const first = nonEmpty[0].join(',').toLowerCase();
  const start = first.includes('email') || first.includes('region') ? 1 : 0;
  return nonEmpty.slice(start).map((row) => {
    const [firstName = '', lastName = '', email = '', rawRegion = ''] = row.map((c) => c.trim());
    const region = normalizeRegion(rawRegion);
    let problem: string | undefined;
    if (!firstName || !lastName) problem = 'Missing name';
    else if (!EMAIL_RE.test(email)) problem = 'Invalid email';
    else if (!region) problem = `Unknown region "${rawRegion}"`;
    return { firstName, lastName, email, region, rawRegion, valid: !problem, problem };
  });
}


const TEMPLATE = 'firstName,lastName,email,region\nAma,Mensah,ama.mensah@uni.edu.gh,Greater Accra\nKojo,Owusu,kojo.owusu@uni.edu.gh,Ashanti\n';

export default function SupervisorUploadPanel() {
  const bulk = useBulkCreateSupervisors();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<BulkSupervisorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    bulk.mutate(
      valid.map((r) => ({ firstName: r.firstName, lastName: r.lastName, email: r.email, region: r.region! })),
      {
        onSuccess: (res) => { setResult(res); setRows([]); setFileName(null); },
        onError: () => setError('Upload failed — please try again.'),
      },
    );
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'supervisors-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-5 w-5 text-brand-ink" />
        <h2 className="text-sm font-bold text-ink">Upload supervisor roster</h2>
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Accepts CSV, Excel (.xlsx/.xls), TSV or plain text. Columns:{' '}
        <span className="font-mono">firstName, lastName, email, region</span>. Region accepts the name
        (e.g. "Greater Accra"). New supervisors are created for their region — interns who pick that region at
        registration are auto-assigned to them. New accounts set their password via "Forgot password".
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
              type="button" onClick={onUpload} disabled={valid.length === 0 || bulk.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-ok px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-line-strong"
            >
              {bulk.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create {valid.length} supervisor{valid.length === 1 ? '' : 's'}
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
                      {r.region ? REGION_LABELS[r.region as keyof typeof REGION_LABELS] : <span className="text-danger">{r.problem}</span>}
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
            {result.created} created · {result.updated} updated{result.skipped > 0 && ` · ${result.skipped} skipped`}
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
    </section>
  );
}
