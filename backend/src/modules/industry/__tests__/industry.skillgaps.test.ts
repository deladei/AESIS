/**
 * Departmental skill gaps from the employer evaluations.
 *
 * Two things here are worth guarding. The employer form is sealed-envelope —
 * the ACADEMIC SUPERVISOR is staff for almost every other purpose and must
 * still be refused this one. And the ranking is only meaningful once each
 * criterion is normalised against its own maximum, because attendance is out of
 * 20 and safety out of 10.
 */
const mockPrisma = {
  placement: { findMany: jest.fn() },
};

jest.mock('../../../config/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { getIndustrySkillGaps, MIN_SKILL_GAP_COHORT } from '../industry.assessment';

const coordinator = { id: 'c-1', role: 'coordinator' as const };

/** A full-marks evaluation, so a test only has to state what it is varying. */
const perfect = {
  attendance: 20, understanding: 20, aptitude: 15,
  punctuality: 15, autonomy: 10, cooperation: 10, safety: 10,
};

const placementsOf = (rows: Record<string, number>[][]) =>
  rows.map((assessments, i) => ({ id: `p-${i}`, industryAssessments: assessments }));

/** N placements at full marks — enough to clear the suppression threshold. */
const cohort = (n: number, override: Record<string, number> = {}) =>
  placementsOf(Array.from({ length: n }, () => [{ ...perfect, ...override }]));

beforeEach(() => jest.clearAllMocks());

describe('who may read the employer evaluation', () => {
  it.each([
    ['student'],
    ['company_supervisor'],
    // The one that matters. A supervisor reviews these students' logbooks every
    // week and is still not permitted to see what the employer said about them.
    ['academic_supervisor'],
  ])('refuses %s', async (role) => {
    await expect(getIndustrySkillGaps({ id: 'u-1', role: role as 'student' }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.placement.findMany).not.toHaveBeenCalled();
  });

  it.each(['coordinator', 'admin', 'hod'])('allows %s', async (role) => {
    mockPrisma.placement.findMany.mockResolvedValue([]);
    await expect(getIndustrySkillGaps({ id: 'u-1', role: role as 'admin' }))
      .resolves.toBeDefined();
  });
});

describe('the small-cohort guard', () => {
  it('withholds the whole panel below the threshold, computing no means at all', async () => {
    // A partial table is what a reader differences to recover the withheld
    // figures, so nothing is computed rather than some cells being blanked.
    mockPrisma.placement.findMany.mockResolvedValue(cohort(MIN_SKILL_GAP_COHORT - 1));

    const res = await getIndustrySkillGaps(coordinator);

    expect(res.suppressed).toBe(true);
    expect(res.criteria).toEqual([]);
    expect(res.rawTotalMean).toBeNull();
    expect(res.n).toBe(MIN_SKILL_GAP_COHORT - 1);
  });

  it('publishes at exactly the threshold — the boundary is inclusive', async () => {
    mockPrisma.placement.findMany.mockResolvedValue(cohort(MIN_SKILL_GAP_COHORT));

    const res = await getIndustrySkillGaps(coordinator);

    expect(res.suppressed).toBe(false);
    expect(res.criteria).toHaveLength(7);
  });

  it('reports an empty cohort as no data rather than as suppression', async () => {
    mockPrisma.placement.findMany.mockResolvedValue([]);

    const res = await getIndustrySkillGaps(coordinator);

    expect(res.hasData).toBe(false);
    expect(res.criteria).toEqual([]);
  });
});

describe('ranking and normalisation', () => {
  it('ranks on percentage of each criterion’s own maximum, not the raw mark', async () => {
    // The bug this feature would otherwise ship with. attendance 15/20 is 75%
    // and safety 8/10 is 80%, so attendance is the WEAKER of the two even
    // though 15 is the bigger number.
    mockPrisma.placement.findMany.mockResolvedValue(
      cohort(MIN_SKILL_GAP_COHORT, { attendance: 15, safety: 8 }),
    );

    const res = await getIndustrySkillGaps(coordinator);
    const rank = res.criteria.map((c) => c.key);

    expect(rank.indexOf('attendance')).toBeLessThan(rank.indexOf('safety'));
    expect(res.criteria.find((c) => c.key === 'attendance')).toMatchObject({
      meanRaw: 15, max: 20, pctOfMax: 75,
    });
    expect(res.criteria.find((c) => c.key === 'safety')).toMatchObject({
      meanRaw: 8, max: 10, pctOfMax: 80,
    });
  });

  it('puts the weakest criterion first', async () => {
    mockPrisma.placement.findMany.mockResolvedValue(
      cohort(MIN_SKILL_GAP_COHORT, { autonomy: 2 }),
    );

    const res = await getIndustrySkillGaps(coordinator);

    expect(res.criteria[0].key).toBe('autonomy');
    expect(res.criteria[0].pctOfMax).toBe(20);
  });

  it('breaks ties on the key so a printed report does not reorder itself', async () => {
    mockPrisma.placement.findMany.mockResolvedValue(cohort(MIN_SKILL_GAP_COHORT));

    const a = await getIndustrySkillGaps(coordinator);
    mockPrisma.placement.findMany.mockResolvedValue(cohort(MIN_SKILL_GAP_COHORT));
    const b = await getIndustrySkillGaps(coordinator);

    expect(a.criteria.map((c) => c.key)).toEqual(b.criteria.map((c) => c.key));
  });
});

describe('what counts as one observation', () => {
  it('weights a placement once even when two supervisors assessed it', async () => {
    // AssessmentIndustry is unique per (placement, supervisor), so a placement
    // with two unit supervisors has two rows. Averaging rows directly would
    // give it double weight and make `n` — the disclosure denominator — wrong.
    const twoSupervisors = [{ ...perfect, autonomy: 10 }, { ...perfect, autonomy: 0 }];
    mockPrisma.placement.findMany.mockResolvedValue([
      ...cohort(MIN_SKILL_GAP_COHORT - 1, { autonomy: 10 }),
      { id: 'p-shared', industryAssessments: twoSupervisors },
    ]);

    const res = await getIndustrySkillGaps(coordinator);
    const autonomy = res.criteria.find((c) => c.key === 'autonomy')!;

    expect(res.n).toBe(MIN_SKILL_GAP_COHORT);
    expect(autonomy.n).toBe(MIN_SKILL_GAP_COHORT);
    // Four placements at 10 and one at the mean of (10, 0) = 5 → 9, not the
    // 8.33 that averaging six rows would give.
    expect(autonomy.meanRaw).toBe(9);
  });

  it('drops an out-of-range mark from the numerator AND the denominator', async () => {
    // A hand-keyed paper form is the realistic source. Counting it would drag
    // the mean while still claiming the placement as evidence.
    mockPrisma.placement.findMany.mockResolvedValue([
      ...cohort(MIN_SKILL_GAP_COHORT, { safety: 10 }),
      { id: 'p-bad', industryAssessments: [{ ...perfect, safety: 99 }] },
    ]);

    const res = await getIndustrySkillGaps(coordinator);
    const safety = res.criteria.find((c) => c.key === 'safety')!;

    expect(safety.meanRaw).toBe(10);
    expect(safety.n).toBe(MIN_SKILL_GAP_COHORT);
    expect(res.n).toBe(MIN_SKILL_GAP_COHORT + 1); // still a placement, just not for safety
  });

  it('renders a criterion nobody validly scored as null, never as zero', async () => {
    mockPrisma.placement.findMany.mockResolvedValue(
      cohort(MIN_SKILL_GAP_COHORT, { aptitude: -5 }),
    );

    const res = await getIndustrySkillGaps(coordinator);
    const aptitude = res.criteria.find((c) => c.key === 'aptitude')!;

    expect(aptitude.meanRaw).toBeNull();
    expect(aptitude.pctOfMax).toBeNull();
    expect(aptitude.n).toBe(0);
  });
});

describe('what the response is allowed to contain', () => {
  it('carries no free text and nothing identifying', async () => {
    mockPrisma.placement.findMany.mockResolvedValue(cohort(MIN_SKILL_GAP_COHORT));

    const res = await getIndustrySkillGaps(coordinator);
    const serialised = JSON.stringify(res);

    for (const leak of ['additionalComments', 'reportingOfficerName', 'scanUrl',
                        'placementId', 'studentId', 'industrySupervisorId', 'firstName']) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('never selects the confidential columns in the first place', async () => {
    mockPrisma.placement.findMany.mockResolvedValue([]);

    await getIndustrySkillGaps(coordinator);

    const select = mockPrisma.placement.findMany.mock.calls[0][0].select
      .industryAssessments.select;
    expect(select).not.toHaveProperty('additionalComments');
    expect(select).not.toHaveProperty('reportingOfficerName');
    expect(select).not.toHaveProperty('scanUrl');
  });

  it('scopes to a cohort and a programme without leaking the filter into the shape', async () => {
    mockPrisma.placement.findMany.mockResolvedValue([]);

    await getIndustrySkillGaps(coordinator, { academicYearId: 'y-1', programmeId: 'prog-1' });

    expect(mockPrisma.placement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        academicYearId: 'y-1',
        student: { programmeId: 'prog-1' },
      }),
    }));
  });

  it('does not filter on placementStatus active', async () => {
    // The employer evaluation arrives at the END of the attachment, by which
    // time the placement is `completed`. Copying the `active` filter the other
    // cohort aggregates use would return almost nothing, for ever, and read as
    // "no evaluations yet" rather than as a bug.
    mockPrisma.placement.findMany.mockResolvedValue([]);

    await getIndustrySkillGaps(coordinator);

    const where = mockPrisma.placement.findMany.mock.calls[0][0].where;
    expect(where.placementStatus).toEqual({ not: 'cancelled' });
  });
});
