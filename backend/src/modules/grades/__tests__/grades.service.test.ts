jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: { findUnique: jest.fn() },
    finalGrade: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    cohortConfig: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
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
} from '../grades.service';
import { overrideSchema } from '../grades.schema';
import type { Actor } from '../../entries/entries.policy';

const mp = prisma as unknown as {
  placement: { findUnique: jest.Mock };
  finalGrade: { findUnique: jest.Mock; findFirst: jest.Mock; upsert: jest.Mock; update: jest.Mock };
  cohortConfig: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock };
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
