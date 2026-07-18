import { serializeGrade, assertCanManageGrade, assertCanReadGrade, assertCanScoreComponent } from '../grades.policy';
import type { GradeOwnership, GradeRow } from '../grades.policy';
import { assertPlacementAccess } from '../../entries/entries.policy';

const ownership: GradeOwnership = {
  id: 'p1',
  studentId: 's1',
  academicSupervisorId: 'as1',
  companySupervisorId: 'cs1',
  academicYearId: 'ay1',
};

const grade: GradeRow = {
  industryRaw: 80,
  universityRaw: 70,
  reportRaw: 60,
  logbookRaw: 90,
  industryWeighted: 24,
  universityWeighted: 21,
  reportWeighted: 18,
  logbookWeighted: 9,
  total: 72,
  coordinatorOverride: null,
  overrideReason: null,
  status: 'draft',
  signedOffAt: null,
  releasedAt: null,
};

const hod = { id: 'h1', role: 'hod' as const };

describe('hod grade authority', () => {
  it('may read, score, and manage grades', () => {
    expect(() => assertCanReadGrade(hod, ownership)).not.toThrow();
    expect(() => assertCanScoreComponent(hod, ownership, 'industry')).not.toThrow();
    expect(() => assertCanManageGrade(hod)).not.toThrow();
  });

  it('serializer gives hod the full staff view including the industry component', () => {
    const view = serializeGrade(hod, ownership, grade) as Record<string, unknown>;
    expect(view.total).toBe(72);
    expect((view.components as Record<string, { raw: number }>).industry.raw).toBe(80);
  });
});

describe('hod entries access', () => {
  const placement = { id: 'p1', studentId: 's1', academicSupervisorId: 'as1', companySupervisorId: 'cs1' };

  it('reads any placement', () => {
    expect(() => assertPlacementAccess(hod, placement, 'read')).not.toThrow();
  });

  it('never writes or transitions entries (read-only oversight, like coordinator)', () => {
    expect(() => assertPlacementAccess(hod, placement, 'write')).toThrow('read-only');
    expect(() => assertPlacementAccess(hod, placement, 'transition')).toThrow('read-only');
  });
});
