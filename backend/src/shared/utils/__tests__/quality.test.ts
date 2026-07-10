import {
  toQualityNumber,
  isValidQualityScore,
  clampQualityScore,
  meanQualityScore,
  v2QualityOverall,
  mergedQualityScores,
  weeksBetween,
  expectedWeeks,
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
  it('caps the expected week count at the system-wide 6, even when dates span longer', () => {
    // The raw span is 24 weeks, but the internship is a fixed 6-week programme,
    // so nothing above six can ever surface.
    expect(weeksBetween(new Date('2026-01-12'), new Date('2026-06-29'))).toBe(24);
    expect(expectedWeeks('2026-01-12', '2026-06-29')).toBe(6);
  });

  it('returns the real (sub-6) week count for a short span', () => {
    // Jan 12 – Feb 9 ≈ 4 weeks, under the cap → reported as-is.
    expect(expectedWeeks('2026-01-12', '2026-02-09')).toBe(4);
  });

  it('caps a contradictory config at 6 as well', () => {
    expect(expectedWeeks(null, null, 12)).toBe(6);
    expect(expectedWeeks('2026-06-29', '2026-01-12', 12)).toBe(6); // end before start
  });

  it('falls back to the 6-week default when the date span is unusable', () => {
    expect(expectedWeeks(null, null)).toBe(6);
  });

  it('caps current week at the derived total so it can never exceed the internship length', () => {
    const p = weekProgress({
      startDate: '2026-01-12',
      endDate: '2026-06-29',
      totalWeeksConfig: 6,
      submittedCount: 30,
    });
    expect(p.total).toBe(6);
    expect(p.current).toBe(6); // capped, not 30
  });
});
