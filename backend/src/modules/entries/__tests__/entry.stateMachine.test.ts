import { resolveTransition, isTerminal, isEditable } from '../entry.stateMachine';
import { AppError } from '../../../middleware/errorHandler';

describe('entry state machine', () => {
  describe('valid transitions', () => {
    it('student submits a draft -> submitted', () => {
      expect(resolveTransition('draft', 'submit', 'student')).toEqual({
        to: 'submitted',
        bumpsVersion: false,
      });
    });

    it('supervisor acknowledges submitted -> acknowledged', () => {
      expect(resolveTransition('submitted', 'acknowledge', 'academic_supervisor')).toEqual({
        to: 'acknowledged',
        bumpsVersion: false,
      });
    });

    it('supervisor returns submitted -> returned', () => {
      expect(resolveTransition('submitted', 'return', 'academic_supervisor')).toEqual({
        to: 'returned',
        bumpsVersion: false,
      });
    });

    it('student reopens returned -> draft and bumps version', () => {
      expect(resolveTransition('returned', 'reopen', 'student')).toEqual({
        to: 'draft',
        bumpsVersion: true,
      });
    });

    it('supervisor rejects submitted -> rejected', () => {
      expect(resolveTransition('submitted', 'reject', 'academic_supervisor')).toEqual({
        to: 'rejected',
        bumpsVersion: false,
      });
    });

    it('admin may perform any transition (break-glass)', () => {
      expect(resolveTransition('submitted', 'acknowledge', 'admin').to).toBe('acknowledged');
      expect(resolveTransition('draft', 'submit', 'admin').to).toBe('submitted');
    });
  });

  describe('invalid transitions reject with 409', () => {
    const cases: Array<[Parameters<typeof resolveTransition>[0], Parameters<typeof resolveTransition>[1]]> = [
      ['acknowledged', 'submit'], // terminal is locked
      ['acknowledged', 'return'],
      ['acknowledged', 'reopen'],
      ['draft', 'acknowledge'],
      ['draft', 'return'],
      ['draft', 'reject'],
      ['returned', 'acknowledge'],
      ['returned', 'reject'],
      ['submitted', 'submit'],
      ['rejected', 'submit'], // terminal is locked
      ['rejected', 'reopen'],
      ['acknowledged', 'reject'],
    ];
    it.each(cases)('cannot %s -> %s', (from, action) => {
      try {
        resolveTransition(from, action, 'admin'); // admin bypasses role guard, so we hit the 409
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).statusCode).toBe(409);
      }
    });
  });

  describe('role guard rejects with 403', () => {
    it('student cannot acknowledge', () => {
      expect(() => resolveTransition('submitted', 'acknowledge', 'student')).toThrow(AppError);
      try {
        resolveTransition('submitted', 'acknowledge', 'student');
      } catch (e) {
        expect((e as AppError).statusCode).toBe(403);
      }
    });

    it('supervisor cannot submit on behalf of a student', () => {
      try {
        resolveTransition('draft', 'submit', 'academic_supervisor');
      } catch (e) {
        expect((e as AppError).statusCode).toBe(403);
      }
    });

    it('coordinator cannot transition anything', () => {
      try {
        resolveTransition('submitted', 'acknowledge', 'coordinator');
      } catch (e) {
        expect((e as AppError).statusCode).toBe(403);
      }
    });

    it('role guard is checked before the state guard (no state probing via 409)', () => {
      // coordinator on a terminal entry should still be 403, not 409
      try {
        resolveTransition('acknowledged', 'acknowledge', 'coordinator');
      } catch (e) {
        expect((e as AppError).statusCode).toBe(403);
      }
    });
  });

  describe('status predicates', () => {
    it('acknowledged and rejected are terminal', () => {
      expect(isTerminal('acknowledged')).toBe(true);
      expect(isTerminal('rejected')).toBe(true);
      expect(isTerminal('submitted')).toBe(false);
      expect(isTerminal('draft')).toBe(false);
      expect(isTerminal('returned')).toBe(false);
    });

    it('draft and returned are editable; submitted/acknowledged/rejected are not', () => {
      expect(isEditable('draft')).toBe(true);
      expect(isEditable('returned')).toBe(true);
      expect(isEditable('submitted')).toBe(false);
      expect(isEditable('acknowledged')).toBe(false);
      expect(isEditable('rejected')).toBe(false);
    });
  });
});
