import { useState } from 'react';
import { api } from '@/lib/api';
import { apiErrorDetail } from '@/lib/apiError';

interface SelfTest {
  ok: boolean;
  name?: string;
  code?: string | null;
  message?: string;
  frames?: string[];
}

/**
 * Ask the API why the panel it backs is failing.
 *
 * A 500 tells the browser that something threw and nothing about what. The
 * stack lives in the host's log, which is not reachable from the page that is
 * broken — so the person looking at the failure is the one person who cannot
 * see it. This calls the panel's self-test, which runs the same read behind
 * the same authorization and reports the exception instead of throwing it.
 *
 * Only worth offering on a 5xx: a 401, a 403 or a request that never left the
 * browser is already fully explained by its status.
 */
export function Diagnose({ path }: { path: string }) {
  const [result, setResult] = useState<SelfTest | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setFailed(null);
    try {
      const r = await api.get<{ data: SelfTest }>(path);
      setResult(r.data.data);
    } catch (err) {
      setFailed(apiErrorDetail(err) ?? 'The self-test could not be run.');
    } finally {
      setRunning(false);
    }
  };

  if (result || failed) {
    return (
      <div className="mt-4 w-full max-w-2xl rounded-lg border border-line bg-surface-sunken p-3 text-left">
        {failed && <p className="text-xs text-ink-secondary">{failed}</p>}
        {result?.ok && (
          <p className="text-xs text-ink-secondary">
            The read succeeded this time — the failure was not reproducible just now.
          </p>
        )}
        {result && !result.ok && (
          <>
            <p className="text-xs font-semibold text-ink">
              {result.name}{result.code ? ` (${result.code})` : ''}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-secondary">
              {result.message}
            </p>
            {result.frames && result.frames.length > 0 && (
              <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-ink-secondary">
                {result.frames.join('\n')}
              </pre>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={running}
      className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-surface-sunken disabled:opacity-60"
    >
      {running ? 'Checking…' : 'Why?'}
    </button>
  );
}
