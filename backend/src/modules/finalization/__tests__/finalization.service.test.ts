jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: { findUnique: jest.fn(), update: jest.fn() },
    placementAssessment: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
  },
}));

import { prisma } from '../../../config/prisma';
import { recordAssessment, getFinalAssessment } from '../finalization.service';
import { assessmentSchema } from '../finalization.schema';
import type { Actor } from '../../entries/entries.policy';

const mp = prisma as unknown as {
  placement: { findUnique: jest.Mock; update: jest.Mock };
  placementAssessment: { upsert: jest.Mock; findUnique: jest.Mock; update: jest.Mock; findUniqueOrThrow: jest.Mock };
};

const SUP:    Actor = { id: 'sup-1', role: 'academic_supervisor' };
const STUDENT: Actor = { id: 'stu-1', role: 'student' };
const COORD:  Actor = { id: 'co-1', role: 'coordinator' };

beforeEach(() => jest.clearAllMocks());

// ── recordAssessment with structured evaluation ──
describe('recordAssessment (evaluation form)', () => {
  it('persists the validated evaluation and moves active → assessment_pending', async () => {
    mp.placement.findUnique.mockResolvedValue({
      id: 'p-1', academicSupervisorId: 'sup-1', companySupervisorId: null, finalizationStatus: 'active',
    });
    mp.placementAssessment.upsert.mockResolvedValue({ id: 'a-1' });
    mp.placement.update.mockResolvedValue({});

    await recordAssessment(SUP, 'p-1', {
      grade: 'A',
      evaluation: { criteria: [{ criterion: 'Technical quality', rating: 4 }], recommendation: 'pass' },
    });

    const call = mp.placementAssessment.upsert.mock.calls[0][0];
    expect(call.create.evaluation).toEqual({ criteria: [{ criterion: 'Technical quality', rating: 4 }], recommendation: 'pass' });
    expect(call.update.evaluation).toBeDefined();
    expect(mp.placement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { finalizationStatus: 'assessment_pending' } }),
    );
  });

  it('refuses to touch the assessment once finalized (immutable)', async () => {
    mp.placement.findUnique.mockResolvedValue({
      id: 'p-1', academicSupervisorId: 'sup-1', companySupervisorId: null, finalizationStatus: 'finalized',
    });
    await expect(recordAssessment(SUP, 'p-1', { grade: 'B' })).rejects.toThrow('locked');
    expect(mp.placementAssessment.upsert).not.toHaveBeenCalled();
  });
});

// ── getFinalAssessment (visibility gate + package) ──
describe('getFinalAssessment', () => {
  function full(over: Record<string, unknown> = {}) {
    return {
      studentId: 'stu-1', academicSupervisorId: 'sup-1', companySupervisorId: 'comp-1',
      finalizationStatus: 'finalized', startDate: new Date('2026-01-01'), endDate: new Date('2026-06-01'),
      student: { firstName: 'Kwabena', lastName: 'Asare' },
      company: { name: 'Acme Ghana' },
      placementAssessment: {
        grade: 'A', narrative: 'Strong placement', evaluation: { criteria: [], recommendation: 'pass' },
        crossWeekSummary: null, finalizedAt: new Date('2026-06-02'),
        academicSupervisor: { firstName: 'Ama', lastName: 'Owusu' },
      },
      companyAttestation: { confirmed: true, comment: 'Confirmed', attestedAt: new Date('2026-06-01') },
      documents: [{ id: 'd-1', fileName: 'final_report.pdf', fileUrl: 'https://x/r.pdf', uploadedAt: new Date('2026-05-30') }],
      ...over,
    };
  }

  it('returns the closeout package to the student once finalized', async () => {
    mp.placement.findUnique.mockResolvedValue(full());
    const r = await getFinalAssessment(STUDENT, 'p-1');
    expect(r).toMatchObject({
      finalized: true,
      grade: 'A',
      student: 'Kwabena Asare',
      organisation: 'Acme Ghana',
      signedOffBy: 'Ama Owusu',
      finalReport: { fileName: 'final_report.pdf', fileUrl: 'https://x/r.pdf' },
      companyAttestation: { confirmed: true },
    });
  });

  it('hides an in-progress assessment from the student until finalized', async () => {
    mp.placement.findUnique.mockResolvedValue(full({ finalizationStatus: 'assessment_pending' }));
    await expect(getFinalAssessment(STUDENT, 'p-1')).rejects.toThrow('once the internship is finalized');
  });

  it('lets the assigned academic supervisor see it in progress', async () => {
    mp.placement.findUnique.mockResolvedValue(full({ finalizationStatus: 'active' }));
    const r = await getFinalAssessment(SUP, 'p-1');
    expect(r.finalized).toBe(false);
    expect(r.grade).toBe('A');
  });

  it('denies a supervisor who is not assigned to the placement', async () => {
    mp.placement.findUnique.mockResolvedValue(full({ academicSupervisorId: 'other', finalizationStatus: 'active' }));
    await expect(getFinalAssessment(SUP, 'p-1')).rejects.toThrow('Access denied');
  });

  it('lets a coordinator read it regardless of finalization', async () => {
    mp.placement.findUnique.mockResolvedValue(full({ finalizationStatus: 'active' }));
    const r = await getFinalAssessment(COORD, 'p-1');
    expect(r.grade).toBe('A');
  });
});

// ── evaluation rating validation (AI/human values clamped at the edge) ──
describe('assessmentSchema evaluation ratings', () => {
  it('accepts ratings within 1–5', () => {
    expect(assessmentSchema.safeParse({ grade: 'A', evaluation: { criteria: [{ criterion: 'X', rating: 5 }] } }).success).toBe(true);
  });
  it('rejects a rating above 5', () => {
    expect(assessmentSchema.safeParse({ grade: 'A', evaluation: { criteria: [{ criterion: 'X', rating: 6 }] } }).success).toBe(false);
  });
  it('rejects a rating below 1', () => {
    expect(assessmentSchema.safeParse({ grade: 'A', evaluation: { criteria: [{ criterion: 'X', rating: 0 }] } }).success).toBe(false);
  });
});
