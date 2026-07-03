import { evaluateDayWindow, DAY_GRACE_DAYS } from '../entries.day.service';

// Pure day-window rule (date-only, UTC). No DB.
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('evaluateDayWindow', () => {
  const today = d('2026-06-29');

  it('allows logging on the same day, not late', () => {
    expect(evaluateDayWindow(d('2026-06-29'), today)).toEqual({
      future: false, blocked: false, lateBy: 0, loggedLate: false,
    });
  });

  it('allows within the grace window and flags it late', () => {
    expect(evaluateDayWindow(d('2026-06-27'), today)).toMatchObject({
      future: false, blocked: false, lateBy: DAY_GRACE_DAYS, loggedLate: true,
    });
  });

  it('allows a day older than the grace window, flagged late', () => {
    const r = evaluateDayWindow(d('2026-06-26'), today); // 3 days late, grace 2
    expect(r).toMatchObject({ future: false, blocked: false, loggedLate: true });
    expect(r.lateBy).toBe(3);
  });

  it('allows a long-forgotten day, still flagged late', () => {
    const r = evaluateDayWindow(d('2026-06-01'), today); // 28 days late
    expect(r).toMatchObject({ future: false, blocked: false, loggedLate: true });
    expect(r.lateBy).toBe(28);
  });

  it('blocks (and marks future) a day in the future', () => {
    const r = evaluateDayWindow(d('2026-06-30'), today);
    expect(r).toMatchObject({ future: true, blocked: true, loggedLate: false });
    expect(r.lateBy).toBeLessThan(0);
  });
});
