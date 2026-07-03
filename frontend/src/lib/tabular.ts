// Tabular file readers shared by the coordinator roster upload panels.
// CSV/TSV/TXT are parsed inline; Excel goes through SheetJS, lazy-loaded so
// the library never lands in the main bundle.

// Split a single delimited line, tolerating simple quoted cells.
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === delim && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// CSV / TSV / plain text → cell rows. Sniffs the delimiter (tab beats comma).
export function cellsFromText(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const delim = lines[0]?.includes('\t') ? '\t' : ',';
  return lines.map((l) => splitLine(l, delim));
}

// Excel (.xlsx/.xls) → cell rows via SheetJS, first sheet only.
export async function cellsFromExcel(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  return rows.map((r) => r.map((c) => String(c ?? '')));
}

export const EXCEL_RE = /\.(xlsx|xls)$/i;

/** Any supported roster file → trimmed cell rows. Throws on unreadable input. */
export async function fileToCells(file: File): Promise<string[][]> {
  return EXCEL_RE.test(file.name) ? cellsFromExcel(file) : cellsFromText(await file.text());
}

export const UPLOAD_ACCEPT =
  '.csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,text/plain,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
