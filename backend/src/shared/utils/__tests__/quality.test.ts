import {
  toQualityNumber,
  isValidQualityScore,
  clampQualityScore,
  meanQualityScore,
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

describe('week/date invariant', () => {
  it('derives the week count from the actual start/end dates (Jan 12 – Jun 29 = 24)', () => {
    expect(expectedWeeks('2026-01-12', '2026-06-29')).toBe(24);
    expect(weeksBetween(new Date('2026-01-12'), new Date('2026-06-29'))).toBe(24);
  });

  it('lets the dates override a contradictory config so the period can never contradict the dates', () => {
    // Config wrongly says 6 weeks, but the dates span 24 → dates win.
    expect(expectedWeeks('2026-01-12', '2026-06-29', 6)).toBe(24);
  });

  it('falls back to config, then 24, only when the date span is unusable', () => {
    expect(expectedWeeks(null, null, 12)).toBe(12);
    expect(expectedWeeks(null, null)).toBe(24);
    expect(expectedWeeks('2026-06-29', '2026-01-12', 12)).toBe(12); // end before start
  });

  it('caps current week at the derived total so it can never exceed the internship length', () => {
    const p = weekProgress({
      startDate: '2026-01-12',
      endDate: '2026-06-29',
      totalWeeksConfig: 6,
      submittedCount: 30,
    });
    expect(p.total).toBe(24);
    expect(p.current).toBe(24); // capped, not 30
  });
});
