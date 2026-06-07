import { parseDateOnly, isFuture, daysBetween, todayUtc } from '../entry.dates';
import { AppError } from '../../../middleware/errorHandler';

describe('entry.dates (timezone-safe date handling)', () => {
  describe('parseDateOnly', () => {
    it('parses a valid date to UTC midnight (no TZ drift)', () => {
      const d = parseDateOnly('2026-03-02');
      expect(d.toISOString()).toBe('2026-03-02T00:00:00.000Z');
    });

    it('rejects non-YYYY-MM-DD formats', () => {
      expect(() => parseDateOnly('02/03/2026')).toThrow(AppError);
      expect(() => parseDateOnly('2026-3-2')).toThrow(AppError);
      expect(() => parseDateOnly('')).toThrow(AppError);
    });

    it('rejects non-calendar dates instead of rolling them forward', () => {
      // JS Date would turn 2026-02-31 into early March; we must reject it.
      expect(() => parseDateOnly('2026-02-31')).toThrow(AppError);
      expect(() => parseDateOnly('2026-13-01')).toThrow(AppError);
    });
  });

  describe('isFuture', () => {
    it('flags tomorrow as future and yesterday as not', () => {
      const tomorrow = new Date(todayUtc().getTime() + 86_400_000);
      const yesterday = new Date(todayUtc().getTime() - 86_400_000);
      expect(isFuture(tomorrow)).toBe(true);
      expect(isFuture(yesterday)).toBe(false);
      expect(isFuture(todayUtc())).toBe(false); // today is not future
    });
  });

  describe('daysBetween', () => {
    it('counts whole days between two date-only values', () => {
      expect(daysBetween(parseDateOnly('2026-03-01'), parseDateOnly('2026-03-08'))).toBe(7);
      expect(daysBetween(parseDateOnly('2026-03-08'), parseDateOnly('2026-03-01'))).toBe(-7);
    });
  });
});
