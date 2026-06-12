import { toHoursNumber, sumHours, expectedHours, hoursSummary } from '../hours';

describe('toHoursNumber', () => {
  it('coerces a Decimal-as-string to a number (no concatenation)', () => {
    expect(toHoursNumber('37.5')).toBe(37.5);
  });
  it('passes a numeric value through', () => {
    expect(toHoursNumber(40)).toBe(40);
  });
  it('returns null for null/undefined/empty', () => {
    expect(toHoursNumber(null)).toBeNull();
    expect(toHoursNumber(undefined)).toBeNull();
    expect(toHoursNumber('')).toBeNull();
  });
  it('rejects non-numeric and negative values', () => {
    expect(toHoursNumber('abc')).toBeNull();
    expect(toHoursNumber(-5)).toBeNull();
  });
});

describe('sumHours', () => {
  it('sums Decimal-as-string hours numerically, not by concatenation', () => {
    // 40 + 37.5 + 40 = 117.5, never "4037.540"
    expect(sumHours(['40', '37.5', '40'])).toBe(117.5);
  });
  it('ignores null/invalid entries', () => {
    expect(sumHours(['40', null, undefined, 'abc', '20'])).toBe(60);
  });
  it('is 0 for an empty list', () => {
    expect(sumHours([])).toBe(0);
  });
  it('rounds to 2 decimals', () => {
    expect(sumHours(['0.1', '0.2'])).toBe(0.3);
  });
});

describe('expectedHours', () => {
  it('multiplies the per-week minimum by the week count', () => {
    expect(expectedHours(40, 24)).toBe(960);
  });
  it('is 0 when no minimum is configured', () => {
    expect(expectedHours(0, 24)).toBe(0);
  });
  it('is 0 for a non-positive week count', () => {
    expect(expectedHours(40, 0)).toBe(0);
  });
});

describe('hoursSummary', () => {
  it('flags a shortfall when logged hours fall below the expected total', () => {
    const s = hoursSummary({ rawLoggedHours: ['40', '37.5'], perWeekMin: 40, weeks: 24 });
    expect(s).toEqual({ logged: 77.5, expected: 960, perWeekMin: 40, shortfall: true });
  });
  it('does not flag a shortfall once the expected total is met', () => {
    const s = hoursSummary({ rawLoggedHours: ['100', '100'], perWeekMin: 40, weeks: 4 });
    expect(s).toEqual({ logged: 200, expected: 160, perWeekMin: 40, shortfall: false });
  });
  it('never flags a shortfall when no minimum is configured (expected 0)', () => {
    const s = hoursSummary({ rawLoggedHours: [], perWeekMin: 0, weeks: 24 });
    expect(s).toEqual({ logged: 0, expected: 0, perWeekMin: 0, shortfall: false });
  });
});
