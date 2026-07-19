import {
  isoWeekday,
  classifyDay,
  weekNumberFor,
  weeksInAttachment,
  evaluateDayAdmissibility,
  withinEditWindow,
  type AttachmentCalendar,
  type AdmissibilityRules,
} from '../siwes.calendar';

// Pure calendar rules on fixed dates. 2026-06-01 is a Monday.
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const cal: AttachmentCalendar = {
  chainStart: d('2026-06-01'),
  chainEnd: d('2026-07-12'), // 6 full weeks (42 days)
  workingDays: [1, 2, 3, 4, 5],
  nonWorkingDays: new Set(['2026-06-10']), // a Wednesday holiday
};

const rules: AdmissibilityRules = { syncGraceDays: 3, entryEditWindowDays: 2 };

describe('isoWeekday', () => {
  it('maps Monday to 1 and Sunday to 7', () => {
    expect(isoWeekday(d('2026-06-01'))).toBe(1);
    expect(isoWeekday(d('2026-06-06'))).toBe(6);
    expect(isoWeekday(d('2026-06-07'))).toBe(7);
  });
});

describe('classifyDay', () => {
  it('classifies a plain weekday as working', () => {
    expect(classifyDay(d('2026-06-02'), cal)).toBe('working');
  });

  it('classifies weekends as weekly_rest', () => {
    expect(classifyDay(d('2026-06-06'), cal)).toBe('weekly_rest');
    expect(classifyDay(d('2026-06-07'), cal)).toBe('weekly_rest');
  });

  it('a declared holiday beats the weekday pattern', () => {
    expect(classifyDay(d('2026-06-10'), cal)).toBe('non_working');
  });

  it('days outside the attachment are out-of-range regardless of pattern', () => {
    expect(classifyDay(d('2026-05-29'), cal)).toBe('before_attachment');
    expect(classifyDay(d('2026-07-13'), cal)).toBe('after_attachment');
  });

  it('honours a custom working-day pattern (e.g. Mon–Sat)', () => {
    const monSat = { ...cal, workingDays: [1, 2, 3, 4, 5, 6] };
    expect(classifyDay(d('2026-06-06'), monSat)).toBe('working');
    expect(classifyDay(d('2026-06-07'), monSat)).toBe('weekly_rest');
  });
});

describe('weekNumberFor', () => {
  it('starts at week 1 on chainStart', () => {
    expect(weekNumberFor(d('2026-06-01'), cal.chainStart)).toBe(1);
    expect(weekNumberFor(d('2026-06-07'), cal.chainStart)).toBe(1);
  });

  it('rolls to the next week every 7 calendar days', () => {
    expect(weekNumberFor(d('2026-06-08'), cal.chainStart)).toBe(2);
    expect(weekNumberFor(d('2026-06-21'), cal.chainStart)).toBe(3);
    expect(weekNumberFor(d('2026-07-12'), cal.chainStart)).toBe(6);
  });
});

describe('weeksInAttachment', () => {
  it('counts full weeks', () => {
    expect(weeksInAttachment(d('2026-06-01'), d('2026-07-12'))).toBe(6);
  });

  it('a partial trailing week counts as a week slot', () => {
    expect(weeksInAttachment(d('2026-06-01'), d('2026-07-13'))).toBe(7);
  });

  it('never returns less than 1', () => {
    expect(weeksInAttachment(d('2026-06-01'), d('2026-06-01'))).toBe(1);
  });
});

describe('evaluateDayAdmissibility', () => {
  const today = d('2026-06-17'); // Wednesday, week 3

  it('rejects a future day', () => {
    const v = evaluateDayAdmissibility(d('2026-06-18'), today, cal, rules);
    expect(v.admissible).toBe(false);
  });

  it('accepts today without a late flag', () => {
    const v = evaluateDayAdmissibility(d('2026-06-17'), today, cal, rules);
    expect(v).toEqual({ admissible: true, loggedLate: false, lateByDays: 0 });
  });

  it('accepts a forgotten past day FLAGGED late — never hard-blocked', () => {
    const v = evaluateDayAdmissibility(d('2026-06-09'), today, cal, rules);
    expect(v).toEqual({ admissible: true, loggedLate: true, lateByDays: 8 });
  });

  it('rejects weekends, holidays, and out-of-range days', () => {
    for (const day of ['2026-06-07', '2026-06-10', '2026-05-29']) {
      expect(evaluateDayAdmissibility(d(day), today, cal, rules).admissible).toBe(false);
    }
  });

  it('freezes the logbook past chainEnd + syncGraceDays', () => {
    const lastGraceDay = d('2026-07-15'); // chainEnd + 3
    expect(evaluateDayAdmissibility(d('2026-07-10'), lastGraceDay, cal, rules).admissible).toBe(true);
    const afterGrace = d('2026-07-16');
    const v = evaluateDayAdmissibility(d('2026-07-10'), afterGrace, cal, rules);
    expect(v.admissible).toBe(false);
  });
});

describe('withinEditWindow', () => {
  const createdAt = new Date('2026-06-10T09:00:00.000Z');

  it('is editable inside the window (inclusive boundary)', () => {
    expect(withinEditWindow(createdAt, new Date('2026-06-11T09:00:00.000Z'), rules)).toBe(true);
    expect(withinEditWindow(createdAt, new Date('2026-06-12T09:00:00.000Z'), rules)).toBe(true);
  });

  it('locks once the window has passed', () => {
    expect(withinEditWindow(createdAt, new Date('2026-06-12T09:00:01.000Z'), rules)).toBe(false);
  });
});
