import {
  toQualityNumber,
  isValidQualityScore,
  clampQualityScore,
  meanQualityScore,
  v2QualityOverall,
  mergedQualityScores,
  weeksBetween,
  expectedWeeks,
  weeksDue,
  engagementPercent,
  weekProgress,
} from '../quality';

describe('meanQualityScore', () => {
  it('returns the numeric mean rounded to one decimal (normal average)', () => {
    // (80 + 74 + 70 + 61) / 4 = 71.25 → 71.3
    expect(meanQualityScore([80, 74, 70, 61])).toBe(71.3);
  });

  it('treats Decimal-as-string scores as numbers, never concatenating them', () => {
    // The original bug: "75" + "82" + "90" string-concatenated. Must sum to 82.3.
    expect(meanQualityScore(['75', '82', '90'])).toBeCloseTo(82.3, 5);
  });

  it('handles a single scored log', () => {
    expect(meanQualityScore([88])).toBe(88);
    expect(meanQualityScore(['88'])).toBe(88);
  });

  it('returns null when no log is scored (zero scored logs)', () => {
    expect(meanQualityScore([])).toBeNull();
    expect(meanQualityScore([null, undefined, ''])).toBeNull();
  });

  it('excludes null/unscored logs from both numerator and denominator', () => {
    // Only 90 and 70 count → mean 80, NOT (90+70)/4.
    expect(meanQualityScore([90, null, 70, undefined])).toBe(80);
  });

  it('excludes out-of-range AI values so they can never inflate the average', () => {
    // 151565326582 and -5 are dropped; mean of the valid 80 & 60 is 70.
    expect(meanQualityScore([80, 151565326582, 60, -5])).toBe(70);
    // If every value is out of range, the result is null (render "—"), not a number.
    expect(meanQualityScore([151565326582, 200, -1])).toBeNull();
  });

  it('always returns a value within [0, 100]', () => {
    const result = meanQualityScore([100, 100, 100]);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThanOrEqual(100);
  });
});

describe('quality-score coercion + validation', () => {
  it('coerces strings/numbers and rejects junk', () => {
    expect(toQualityNumber('75')).toBe(75);
    expect(toQualityNumber(75)).toBe(75);
    expect(toQualityNumber(null)).toBeNull();
    expect(toQualityNumber('abc')).toBeNull();
  });

  it('validates the [0, 100] range', () => {
    expect(isValidQualityScore(0)).toBe(true);
    expect(isValidQualityScore(100)).toBe(true);
    expect(isValidQualityScore(-1)).toBe(false);
    expect(isValidQualityScore(101)).toBe(false);
    expect(isValidQualityScore(null)).toBe(false);
  });

  it('clamps raw values into [0, 100]', () => {
    expect(clampQualityScore(151565326582)).toBe(100);
    expect(clampQualityScore(-20)).toBe(0);
    expect(clampQualityScore('73.5')).toBe(73.5);
    expect(clampQualityScore('nope')).toBeNull();
  });
});

describe('v2QualityOverall', () => {
  it('extracts a valid overall score from a v2 quality payload', () => {
    expect(v2QualityOverall({ overall: 78, task_depth: 80 })).toBe(78);
    expect(v2QualityOverall({ overall: '78' })).toBe(78); // Decimal-as-string safe
    expect(v2QualityOverall({ overall: 0 })).toBe(0);
    expect(v2QualityOverall({ overall: 100 })).toBe(100);
  });

  it('rejects non-object payloads', () => {
    expect(v2QualityOverall(null)).toBeNull();
    expect(v2QualityOverall(undefined)).toBeNull();
    expect(v2QualityOverall(78)).toBeNull();
    expect(v2QualityOverall('78')).toBeNull();
    expect(v2QualityOverall([78])).toBeNull();
  });

  it('rejects missing or out-of-range overall so it never reaches an aggregate', () => {
    expect(v2QualityOverall({})).toBeNull();
    expect(v2QualityOverall({ overall: null })).toBeNull();
    expect(v2QualityOverall({ overall: 'abc' })).toBeNull();
    expect(v2QualityOverall({ overall: -1 })).toBeNull();
    expect(v2QualityOverall({ overall: 101 })).toBeNull();
    expect(v2QualityOverall({ overall: 151565326582 })).toBeNull();
  });
});

describe('mergedQualityScores', () => {
  const entry = (quality: unknown) => ({ assessments: [{ quality }] });

  it('unions legacy scores with the latest v2 assessment per entry', () => {
    const merged = mergedQualityScores(
      [80, '74'],
      [entry({ overall: 60 }), entry({ overall: 90 })],
    );
    expect(merged).toEqual([80, 74, 60, 90]);
    expect(meanQualityScore(merged)).toBe(76);
  });

  it('yields null (→ "—") through meanQualityScore when neither source has scores', () => {
    expect(meanQualityScore(mergedQualityScores([], []))).toBeNull();
    expect(meanQualityScore(mergedQualityScores([null], [{ assessments: [] }]))).toBeNull();
  });

  it('drops unscorable rows from both streams without skewing the mean', () => {
    const merged = mergedQualityScores(
      [null, 90, 'junk'],
      [{ assessments: [] }, entry(null), entry({ overall: 200 }), entry({ overall: 70 })],
    );
    // Only 90 and 70 survive validation → mean 80.
    expect(meanQualityScore(merged)).toBe(80);
  });

  it('uses only the first (latest) assessment when callers select take:1', () => {
    const merged = mergedQualityScores(
      [],
      [{ assessments: [{ quality: { overall: 55 } }, { quality: { overall: 99 } }] }],
    );
    expect(meanQualityScore(merged)).toBe(55);
  });
});

describe('week/date invariant', () => {
  it('reports the real span of a long attachment instead of flattening it to 6', () => {
    // SYSTEM_MAX_WEEKS used to be 6 and was described as the programme length.
    // It is not — cohorts configure 24 — so a 24-week span now reports 24.
    expect(weeksBetween(new Date('2026-01-12'), new Date('2026-06-29'))).toBe(24);
    expect(expectedWeeks('2026-01-12', '2026-06-29')).toBe(24);
  });

  it('returns the real week count for a short span', () => {
    // Jan 12 – Feb 9 ≈ 4 weeks.
    expect(expectedWeeks('2026-01-12', '2026-02-09')).toBe(4);
  });

  it('trusts the cohort config when the date span is unusable', () => {
    expect(expectedWeeks(null, null, 12)).toBe(12);
    expect(expectedWeeks('2026-06-29', '2026-01-12', 12)).toBe(12); // end before start
  });

  it('falls back to the schema default when there is no span and no config', () => {
    expect(expectedWeeks(null, null)).toBe(5);
  });

  it('prefers the configured length over a date span that disagrees', () => {
    // One programme cannot be two lengths: the cohort's configuration is the
    // answer, and the dates are only a fallback for an unconfigured cohort.
    expect(expectedWeeks('2026-01-12', '2026-06-29', 5)).toBe(5);
  });

  it('still refuses an absurd span — the ceiling is a sanity bound, not a length', () => {
    expect(expectedWeeks('2020-01-01', '2030-01-01')).toBe(52);
  });

  it('caps current week at the derived total so it can never exceed the attachment', () => {
    const p = weekProgress({
      startDate: '2026-01-12',
      endDate: '2026-06-29',
      configuredWeeks: 24,
      submittedCount: 30,
    });
    expect(p.total).toBe(24);
    expect(p.current).toBe(24); // capped, not 30
  });
});

describe('weeksDue — engagement counts what is owed, not the whole programme', () => {
  const start = '2026-01-05';
  const threeWeeksIn = new Date('2026-01-26T00:00:00Z');

  it('grows a week at a time', () => {
    expect(weeksDue(start, 24, threeWeeksIn)).toBe(3);
  });

  it('stops at the cohort length once the attachment is over', () => {
    expect(weeksDue(start, 6, new Date('2026-06-29T00:00:00Z'))).toBe(6);
  });

  it('is 0 before the first full week, and yields no percentage', () => {
    expect(weeksDue(start, 24, new Date('2026-01-08T00:00:00Z'))).toBe(0);
    expect(engagementPercent(0, 0)).toBeNull();
  });

  it('has no answer without a start date', () => {
    expect(weeksDue(null, 24, threeWeeksIn)).toBe(0);
  });

  it('never reports over 100%, however many weeks were submitted', () => {
    expect(engagementPercent(9, 3)).toBe(100);
    expect(engagementPercent(2, 4)).toBe(50);
  });
});
