jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: { findUnique: jest.fn() },
    finalGrade: {
      findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), update: jest.fn(),
    },
    cohortConfig: { findUnique: jest.fn() },
    academicYear: { findUnique: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn() },
  },
}));

import { prisma } from '../../../config/prisma';
import {
  getGrade,
  scoreComponent,
  aggregateGrade,
  overrideGrade,
  releaseGrade,
  inviteIndustryScore,
  getIndustryInviteContext,
  submitIndustryScore,
  getGradeAudit,
  releaseCohort,
  getCohortReport,
  getCohortGradeStats,
} from '../grades.service';
import { overrideSchema } from '../grades.schema';
import type { Actor } from '../../entries/entries.policy';

const mp = prisma as unknown as {
  placement: { findUnique: jest.Mock };
  finalGrade: {
    findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; upsert: jest.Mock; update: jest.Mock;
  };
  cohortConfig: { findUnique: jest.Mock };
  academicYear: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock; findMany: jest.Mock };
};

const COORD: Actor = { id: 'co-1', role: 'coordinator' };
const SUP: Actor = { id: 'sup-1', role: 'academic_supervisor' };
const OTHER_SUP: Actor = { id: 'sup-2', role: 'academic_supervisor' };
const STUDENT: Actor = { id: 'stu-1', role: 'student' };

const OWNERSHIP = {
  id: 'p-1',
  studentId: 'stu-1',
  academicSupervisorId: 'sup-1',
  companySupervisorId: null,
  academicYearId: 'ay-1',
};

const ownPlacement = () => mp.placement.findUnique.mockResolvedValue(OWNERSHIP);

beforeEach(() => jest.clearAllMocks());

// ── Aggregation weight math ───────────────────────────────────
describe('aggregateGrade', () => {
  it('computes weighted contributions and total from cohort weights', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({
      status: 'draft',
      industryRaw: 80,
      universityRaw: 60,
      reportRaw: 90,
      logbookRaw: 100,
    });
    mp.cohortConfig.findUnique.mockResolvedValue({
      weightIndustry: 30, weightUniversity: 30, weightReport: 30, weightLogbook: 10,
    });
    mp.finalGrade.update.mockImplementation(({ data }) => Promise.resolve({ ...data, status: 'approved' }));

    await aggregateGrade(COORD, 'p-1');

    const data = mp.finalGrade.update.mock.calls[0][0].data;
    // 80%*30=24, 60%*30=18, 90%*30=27, 100%*10=10 -> total 79
    expect(data.industryWeighted).toBe(24);
    expect(data.universityWeighted).toBe(18);
    expect(data.reportWeighted).toBe(27);
    expect(data.logbookWeighted).toBe(10);
    expect(data.total).toBe(79);
    expect(data.status).toBe('approved');
    expect(data.signedOffById).toBe('co-1');
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'grade_signed_off' }) }),
    );
  });

  it('falls back to default weights when no cohort config exists', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({
      status: 'draft', industryRaw: 100, universityRaw: 100, reportRaw: 100, logbookRaw: 100,
    });
    mp.cohortConfig.findUnique.mockResolvedValue(null);
    mp.finalGrade.update.mockImplementation(({ data }) => Promise.resolve(data));

    await aggregateGrade(COORD, 'p-1');
    expect(mp.finalGrade.update.mock.calls[0][0].data.total).toBe(100);
  });

  it('blocks aggregation and lists missing components', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({
      status: 'draft', industryRaw: null, universityRaw: 60, reportRaw: null, logbookRaw: 100,
    });
    await expect(aggregateGrade(COORD, 'p-1')).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('industry'),
    });
    expect(mp.finalGrade.update).not.toHaveBeenCalled();
  });

  it('is coordinator authority only — supervisor is forbidden', async () => {
    ownPlacement();
    await expect(aggregateGrade(SUP, 'p-1')).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── Confidentiality (serializer) ──────────────────────────────
describe('getGrade confidentiality', () => {
  const APPROVED = {
    status: 'approved',
    industryRaw: 80, universityRaw: 60, reportRaw: 90, logbookRaw: 100,
    industryWeighted: 24, universityWeighted: 18, reportWeighted: 27, logbookWeighted: 10,
    total: 79, coordinatorOverride: null, overrideReason: null,
    signedOffAt: new Date(), releasedAt: null,
  };

  it('hides the industry score and total from the academic supervisor', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue(APPROVED);
    const view = (await getGrade(SUP, 'p-1')) as any;
    expect(view.components.industry).toBeUndefined();
    expect(view.total).toBeUndefined();
    expect(view.components.university.raw).toBe(60);
  });

  it('hides the total from the student until released', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue(APPROVED);
    const view = (await getGrade(STUDENT, 'p-1')) as any;
    expect(view.total).toBeNull();
    expect(view.released).toBe(false);
    expect(view.components).toBeUndefined();
  });

  it('shows the released total to the student (override takes precedence)', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({
      ...APPROVED, status: 'released', coordinatorOverride: 85, releasedAt: new Date(),
    });
    const view = (await getGrade(STUDENT, 'p-1')) as any;
    expect(view.total).toBe(85);
    expect(view.released).toBe(true);
  });

  it('gives the coordinator the full picture', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue(APPROVED);
    const view = (await getGrade(COORD, 'p-1')) as any;
    expect(view.components.industry.raw).toBe(80);
    expect(view.total).toBe(79);
  });

  it('denies a supervisor who is not assigned to the placement', async () => {
    ownPlacement();
    await expect(getGrade(OTHER_SUP, 'p-1')).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── Component scoring ─────────────────────────────────────────
describe('scoreComponent', () => {
  it('forbids the academic supervisor from scoring the industry component', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue(null);
    await expect(
      scoreComponent(SUP, 'p-1', { component: 'industry', raw: 50 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets the assigned supervisor score university and audits it', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue(null);
    mp.finalGrade.upsert.mockResolvedValue({ status: 'draft', universityRaw: 70 });
    await scoreComponent(SUP, 'p-1', { component: 'university', raw: 70 });
    expect(mp.finalGrade.upsert).toHaveBeenCalled();
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'component_scored' }) }),
    );
  });

  it('reverts an approved grade to draft when a component changes', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({ status: 'approved', universityRaw: 60 });
    mp.finalGrade.upsert.mockResolvedValue({ status: 'draft' });
    await scoreComponent(COORD, 'p-1', { component: 'university', raw: 65 });
    const update = mp.finalGrade.upsert.mock.calls[0][0].update;
    expect(update.status).toBe('draft');
    expect(update.total).toBeNull();
    expect(update.signedOffById).toBeNull();
  });

  it('rejects scoring a released (locked) grade', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({ status: 'released' });
    await expect(
      scoreComponent(COORD, 'p-1', { component: 'university', raw: 65 }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── Override + release gating ─────────────────────────────────
describe('override + release', () => {
  it('requires a reason on override (schema)', () => {
    expect(() => overrideSchema.parse({ total: 80, reason: '' })).toThrow();
    expect(overrideSchema.parse({ total: 80, reason: 'moderation' }).reason).toBe('moderation');
  });

  it('refuses to override a grade that is not yet approved', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({ status: 'draft', total: null });
    await expect(
      overrideGrade(COORD, 'p-1', { total: 80, reason: 'x' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('records an override with reason and audits it', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({ status: 'approved', total: 79 });
    mp.finalGrade.update.mockResolvedValue({ status: 'approved', total: 79, coordinatorOverride: 85 });
    await overrideGrade(COORD, 'p-1', { total: 85, reason: 'moderation' });
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'grade_overridden' }) }),
    );
  });

  it('refuses to release a grade that is not approved', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({ status: 'draft' });
    await expect(releaseGrade(COORD, 'p-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('releases an approved grade and audits it', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({ status: 'approved', total: 79, coordinatorOverride: null });
    mp.finalGrade.update.mockResolvedValue({ status: 'released', total: 79, releasedAt: new Date() });
    const view = (await releaseGrade(COORD, 'p-1')) as any;
    expect(view.released).toBe(true);
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'grade_released' }) }),
    );
  });
});

// ── Batch B — industry-score magic link ───────────────────────
describe('industry-score magic link', () => {
  const future = () => new Date(Date.now() + 3_600_000);
  const past = () => new Date(Date.now() - 3_600_000);
  const withPlacement = (g: Record<string, unknown>) => ({
    ...g,
    placement: {
      startDate: null, endDate: null,
      company: { name: 'Kofi Tech Ltd' },
      student: { firstName: 'Ama', lastName: 'Mensah' },
    },
  });

  it('issues a token (coordinator) and upserts the grade row', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue(null);
    mp.finalGrade.upsert.mockResolvedValue({});
    const res = (await inviteIndustryScore(COORD, 'p-1')) as any;
    expect(typeof res.token).toBe('string');
    expect(res.url).toContain(res.token);
    expect(mp.finalGrade.upsert).toHaveBeenCalled();
  });

  it('forbids a non-coordinator from inviting', async () => {
    ownPlacement();
    await expect(inviteIndustryScore(SUP, 'p-1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses to invite once released', async () => {
    ownPlacement();
    mp.finalGrade.findUnique.mockResolvedValue({ status: 'released' });
    await expect(inviteIndustryScore(COORD, 'p-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns context for a valid token', async () => {
    mp.finalGrade.findFirst.mockResolvedValue(
      withPlacement({ status: 'draft', industrySubmittedAt: null, industryTokenExpiresAt: future() }),
    );
    const ctx = (await getIndustryInviteContext('tok')) as any;
    expect(ctx.organisation).toBe('Kofi Tech Ltd');
    expect(ctx.student).toBe('Ama Mensah');
  });

  it('rejects an invalid token (404)', async () => {
    mp.finalGrade.findFirst.mockResolvedValue(null);
    await expect(getIndustryInviteContext('bad')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects an expired token (410)', async () => {
    mp.finalGrade.findFirst.mockResolvedValue(
      withPlacement({ status: 'draft', industrySubmittedAt: null, industryTokenExpiresAt: past() }),
    );
    await expect(getIndustryInviteContext('tok')).rejects.toMatchObject({ statusCode: 410 });
  });

  it('rejects an already-submitted token (410, single-use)', async () => {
    mp.finalGrade.findFirst.mockResolvedValue(
      withPlacement({ status: 'draft', industrySubmittedAt: new Date(), industryTokenExpiresAt: future() }),
    );
    await expect(submitIndustryScore('tok', { raw: 70 })).rejects.toMatchObject({ statusCode: 410 });
  });

  it('records the industry score and clears the token', async () => {
    mp.finalGrade.findFirst.mockResolvedValue(
      withPlacement({ id: 'g-1', status: 'draft', industrySubmittedAt: null, industryTokenExpiresAt: future() }),
    );
    mp.finalGrade.update.mockResolvedValue({});
    const res = (await submitIndustryScore('tok', { raw: 72 })) as any;
    expect(res.submitted).toBe(true);
    const data = mp.finalGrade.update.mock.calls[0][0].data;
    expect(data.industryRaw).toBe(72);
    expect(data.industryTokenHash).toBeNull();
    expect(data.industrySubmittedAt).toBeInstanceOf(Date);
  });

  it('reverts an approved grade to draft when the industry score arrives', async () => {
    mp.finalGrade.findFirst.mockResolvedValue(
      withPlacement({ id: 'g-1', status: 'approved', industrySubmittedAt: null, industryTokenExpiresAt: future() }),
    );
    mp.finalGrade.update.mockResolvedValue({});
    await submitIndustryScore('tok', { raw: 72 });
    const data = mp.finalGrade.update.mock.calls[0][0].data;
    expect(data.status).toBe('draft');
    expect(data.total).toBeNull();
    expect(data.signedOffById).toBeNull();
  });
});

// ── Audit-log view ────────────────────────────────────────────
describe('getGradeAudit', () => {
  it('returns the trail newest-first with the actor, coordinator only', async () => {
    ownPlacement();
    mp.auditLog.findMany.mockResolvedValue([
      {
        id: 'a-1', action: 'grade_released', metadata: { total: 79 }, createdAt: new Date('2026-06-29'),
        user: { firstName: 'Kwame', lastName: 'Boateng', role: 'coordinator' },
      },
    ]);
    const trail = (await getGradeAudit(COORD, 'p-1')) as any[];
    expect(mp.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'final_grade', entityId: 'p-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(trail[0]).toMatchObject({ action: 'grade_released', actor: { name: 'Kwame Boateng', role: 'coordinator' } });
  });

  it('tolerates a missing user relation', async () => {
    ownPlacement();
    mp.auditLog.findMany.mockResolvedValue([
      { id: 'a-1', action: 'grade_drafted', metadata: {}, createdAt: new Date(), user: null },
    ]);
    const trail = (await getGradeAudit(COORD, 'p-1')) as any[];
    expect(trail[0].actor).toBeNull();
  });

  it('forbids a supervisor from reading the audit trail', async () => {
    ownPlacement();
    await expect(getGradeAudit(SUP, 'p-1')).rejects.toMatchObject({ statusCode: 403 });
    expect(mp.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('404s when the placement is gone', async () => {
    mp.placement.findUnique.mockResolvedValue(null);
    await expect(getGradeAudit(COORD, 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Cohort bulk-release ───────────────────────────────────────
describe('releaseCohort', () => {
  it('releases every approved grade in the year and audits each', async () => {
    mp.academicYear.findUnique.mockResolvedValue({ id: 'ay-1' });
    mp.finalGrade.findMany.mockResolvedValue([
      { id: 'g-1', placementId: 'p-1', total: 79, coordinatorOverride: null },
      { id: 'g-2', placementId: 'p-2', total: 88, coordinatorOverride: 90 },
    ]);
    mp.finalGrade.update.mockResolvedValue({});

    const res = (await releaseCohort(COORD, 'ay-1')) as any;
    expect(res.released).toBe(2);
    expect(mp.finalGrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'approved', placement: { academicYearId: 'ay-1' } } }),
    );
    expect(mp.finalGrade.update).toHaveBeenCalledTimes(2);
    expect(mp.finalGrade.update.mock.calls[0][0].data.status).toBe('released');
    expect(mp.auditLog.create).toHaveBeenCalledTimes(2);
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'grade_released' }) }),
    );
  });

  it('is a no-op when nothing is approved', async () => {
    mp.academicYear.findUnique.mockResolvedValue({ id: 'ay-1' });
    mp.finalGrade.findMany.mockResolvedValue([]);
    const res = (await releaseCohort(COORD, 'ay-1')) as any;
    expect(res.released).toBe(0);
    expect(mp.finalGrade.update).not.toHaveBeenCalled();
  });

  it('404s on an unknown academic year', async () => {
    mp.academicYear.findUnique.mockResolvedValue(null);
    await expect(releaseCohort(COORD, 'nope')).rejects.toMatchObject({ statusCode: 404 });
    expect(mp.finalGrade.findMany).not.toHaveBeenCalled();
  });

  it('forbids a supervisor from bulk-releasing', async () => {
    await expect(releaseCohort(SUP, 'ay-1')).rejects.toMatchObject({ statusCode: 403 });
    expect(mp.academicYear.findUnique).not.toHaveBeenCalled();
  });
});

describe('getCohortReport', () => {
  const REPORT_ROW = {
    industryRaw: 80, universityRaw: 70, reportRaw: 60, logbookRaw: 90,
    total: 73, coordinatorOverride: null, releasedAt: new Date('2026-06-01'),
    placement: {
      region: 'greater_accra',
      company: { name: 'Acme Ghana Ltd' },
      student: { firstName: 'Ama', lastName: 'Mensah', indexNumber: 'CS-001' },
      academicSupervisor: { firstName: 'Kwame', lastName: 'Boateng' },
    },
  };

  it('returns only released grades, flattened, with the effective total', async () => {
    mp.academicYear.findUnique.mockResolvedValue({ id: 'ay-1', label: '2025/2026' });
    mp.finalGrade.findMany.mockResolvedValue([
      REPORT_ROW,
      { ...REPORT_ROW, coordinatorOverride: 85,
        placement: { ...REPORT_ROW.placement, student: { firstName: 'Kojo', lastName: 'Owusu', indexNumber: null }, academicSupervisor: null, company: null } },
    ]);

    const res = (await getCohortReport(COORD, 'ay-1')) as any;
    expect(mp.finalGrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'released', placement: { academicYearId: 'ay-1' } } }),
    );
    expect(res.academicYear).toBe('2025/2026');
    expect(res.count).toBe(2);
    expect(res.rows[0]).toMatchObject({
      studentName: 'Ama Mensah', indexNumber: 'CS-001', company: 'Acme Ghana Ltd',
      region: 'greater_accra', supervisor: 'Kwame Boateng', total: 73, effectiveTotal: 73,
    });
    // override wins for effectiveTotal; null joins degrade to null, never throw.
    expect(res.rows[1]).toMatchObject({
      studentName: 'Kojo Owusu', indexNumber: null, company: null,
      supervisor: null, total: 73, effectiveTotal: 85,
    });
  });

  it('404s on an unknown academic year', async () => {
    mp.academicYear.findUnique.mockResolvedValue(null);
    await expect(getCohortReport(COORD, 'nope')).rejects.toMatchObject({ statusCode: 404 });
    expect(mp.finalGrade.findMany).not.toHaveBeenCalled();
  });

  it('forbids a supervisor and a student', async () => {
    await expect(getCohortReport(SUP, 'ay-1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(getCohortReport(STUDENT, 'ay-1')).rejects.toMatchObject({ statusCode: 403 });
    expect(mp.academicYear.findUnique).not.toHaveBeenCalled();
  });
});

describe('getCohortGradeStats', () => {
  const released = (vals: { total: number | null; coordinatorOverride?: number | null }[]) =>
    vals.map((v) => ({ total: v.total, coordinatorOverride: v.coordinatorOverride ?? null }));

  it('computes mean/median/min/max, bands, pass rate and the 10-bucket histogram', async () => {
    mp.academicYear.findUnique.mockResolvedValue({ id: 'ay-1', label: '2025/2026' });
    // scores: 35 (fail), 45 (resit), 55 (pass), 72 (distinction), 90 (distinction)
    mp.finalGrade.findMany.mockResolvedValue(released([
      { total: 55 }, { total: 90 }, { total: 35 }, { total: 72 }, { total: 45 },
    ]));

    const s = (await getCohortGradeStats(COORD, 'ay-1')) as any;
    expect(mp.finalGrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'released', placement: { academicYearId: 'ay-1' } } }),
    );
    expect(s.count).toBe(5);
    expect(s.mean).toBe(59.4);          // (55+90+35+72+45)/5
    expect(s.median).toBe(55);          // middle of sorted [35,45,55,72,90]
    expect(s.min).toBe(35);
    expect(s.max).toBe(90);
    expect(s.bands).toEqual({ distinction: 2, pass: 1, resit: 1, fail: 1 });
    expect(s.passRate).toBe(60);        // (2+1)/5
    // buckets: 35→[3], 45→[4], 55→[5], 72→[7], 90→[9]
    expect(s.distribution).toEqual([0, 0, 0, 1, 1, 1, 0, 1, 0, 1]);
  });

  it('uses the override as the effective score and lands 100 in the last bucket', async () => {
    mp.academicYear.findUnique.mockResolvedValue({ id: 'ay-1', label: '2025/2026' });
    mp.finalGrade.findMany.mockResolvedValue(released([
      { total: 40, coordinatorOverride: 100 }, // override wins → 100
    ]));
    const s = (await getCohortGradeStats(COORD, 'ay-1')) as any;
    expect(s.max).toBe(100);
    expect(s.distribution[9]).toBe(1);
    expect(s.bands.distinction).toBe(1);
  });

  it('returns nulls (not zeros) for an empty cohort', async () => {
    mp.academicYear.findUnique.mockResolvedValue({ id: 'ay-1', label: '2025/2026' });
    mp.finalGrade.findMany.mockResolvedValue([]);
    const s = (await getCohortGradeStats(COORD, 'ay-1')) as any;
    expect(s).toMatchObject({ count: 0, mean: null, median: null, min: null, max: null, passRate: null });
    expect(s.distribution).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('404s on an unknown year and forbids supervisor/student', async () => {
    mp.academicYear.findUnique.mockResolvedValue(null);
    await expect(getCohortGradeStats(COORD, 'nope')).rejects.toMatchObject({ statusCode: 404 });
    await expect(getCohortGradeStats(SUP, 'ay-1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(getCohortGradeStats(STUDENT, 'ay-1')).rejects.toMatchObject({ statusCode: 403 });
  });
});
