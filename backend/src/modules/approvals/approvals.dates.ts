const DAY_MS = 86_400_000;

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/**
 * Every Mon–Fri date in [from, to] inclusive, as UTC midnights.
 * Weekend days are skipped: leave on a Saturday is not an absence from work
 * that was never scheduled.
 */
export function eachWorkingDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(d));
  }
  return out;
}
