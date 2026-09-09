/**
 * An exception, reduced to what identifies it: the class, the message, and the
 * frames that are ours. Node's stack is mostly library internals — the useful
 * line is nearly always the first `src/` frame.
 */
export function describeFailure(err: unknown) {
  const e = err as { name?: string; message?: string; code?: string; stack?: string };
  const frames = (e?.stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('at ') && l.includes('/src/'))
    .slice(0, 5);
  return {
    name:    e?.name ?? 'Error',
    code:    e?.code ?? null,
    message: e?.message ?? String(err),
    frames,
  };
}
