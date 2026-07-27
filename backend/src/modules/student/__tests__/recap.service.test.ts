import fs from 'fs';
import path from 'path';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: { findFirst: jest.fn() },
    dailyEntry: { findMany: jest.fn() },
    logbookEntry: { findMany: jest.fn() },
    entryActivity: { findMany: jest.fn() },
    entryReflection: { findMany: jest.fn() },
    cohortConfig: { findFirst: jest.fn() },
  },
}));

import { prisma } from '../../../config/prisma';
import { getInternshipRecap, assertOwnRecap } from '../recap.service';

const m = prisma as unknown as {
  placement: { findFirst: jest.Mock };
  dailyEntry: { findMany: jest.Mock };
  logbookEntry: { findMany: jest.Mock };
  entryActivity: { findMany: jest.Mock };
  entryReflection: { findMany: jest.Mock };
  cohortConfig: { findFirst: jest.Mock };
};

const day = (workDate: string, weekNumber: number, skills: string | null, createdAt = workDate) => ({
  workDate: new Date(`${workDate}T00:00:00Z`),
  weekNumber,
  newSkillsLearnt: skills,
  createdAt: new Date(`${createdAt}T09:00:00Z`),
});

function seed(opts: {
  finalized?: boolean;
  days?: ReturnType<typeof day>[];
  entries?: { weekNumber: number; status: string; submittedAt: Date | null }[];
  activities?: { competencyTags: string[] }[];
  reflections?: { challenges: string; updatedAt: Date }[];
  durationWeeks?: number;
} = {}) {
  m.placement.findFirst.mockResolvedValue(
    opts.finalized === false ? null : { id: 'p1', academicYearId: 'y1' },
  );
  m.dailyEntry.findMany.mockResolvedValue(opts.days ?? []);
  m.logbookEntry.findMany.mockResolvedValue(opts.entries ?? []);
  m.entryActivity.findMany.mockResolvedValue(opts.activities ?? []);
  m.entryReflection.findMany.mockResolvedValue(opts.reflections ?? []);
  m.cohortConfig.findFirst.mockResolvedValue({ durationWeeks: opts.durationWeeks ?? 6 });
}

beforeEach(() => jest.clearAllMocks());

describe('gating', () => {
  it('is unavailable until the placement is finalized', async () => {
    seed({ finalized: false });
    const r = await getInternshipRecap('s1');
    expect(r.available).toBe(false);
    expect(r.recap).toBeUndefined();
    expect(r.reason).toMatch(/finalised/i);
  });

  it('queries only the finalized placement', async () => {
    seed();
    await getInternshipRecap('s1');
    expect(m.placement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 's1', finalizationStatus: 'finalized' },
      }),
    );
  });

  it('refuses a non-student caller', () => {
    expect(() => assertOwnRecap('academic_supervisor')).toThrow(/Only a student/);
    expect(() => assertOwnRecap('coordinator')).toThrow();
    expect(() => assertOwnRecap('student')).not.toThrow();
    expect(() => assertOwnRecap('admin')).not.toThrow();
  });
});

describe('aggregates', () => {
  it('counts entries, weeks and on-time days', async () => {
    seed({
      days: [
        day('2026-03-02', 1, 'Lathe setup'),
        day('2026-03-03', 1, 'Welding'),
        day('2026-03-09', 2, 'Safety drill', '2026-03-12'), // written 3 days late
      ],
      entries: [
        { weekNumber: 1, status: 'acknowledged', submittedAt: new Date() },
        { weekNumber: 2, status: 'acknowledged', submittedAt: new Date() },
      ],
      durationWeeks: 8,
    });
    const { recap } = await getInternshipRecap('s1');
    expect(recap!.totalEntries).toBe(3);
    expect(recap!.weeksCovered).toBe(2);
    expect(recap!.totalWeeksInAttachment).toBe(8);
    expect(recap!.daysOnTime).toBe(2);
    expect(recap!.firstEntryDate).toBe('2026-03-02');
    expect(recap!.lastEntryDate).toBe('2026-03-09');
  });

  it('streaks run over consecutive submitted weeks with no late day', async () => {
    seed({
      days: [
        day('2026-03-02', 1, null),
        day('2026-03-09', 2, null),
        day('2026-03-16', 3, null, '2026-03-20'), // week 3 has a late day
        day('2026-03-23', 4, null),
        day('2026-03-30', 5, null),
      ],
      entries: [1, 2, 3, 4, 5].map((weekNumber) => ({
        weekNumber, status: 'acknowledged', submittedAt: new Date(),
      })),
    });
    const { recap } = await getInternshipRecap('s1');
    expect(recap!.longestOnTimeStreak).toBe(2); // weeks 4-5 (1-2 also 2, tie)
  });

  it('a gap in week numbers breaks the streak', async () => {
    seed({
      days: [],
      entries: [
        { weekNumber: 1, status: 'acknowledged', submittedAt: new Date() },
        { weekNumber: 3, status: 'acknowledged', submittedAt: new Date() },
        { weekNumber: 4, status: 'acknowledged', submittedAt: new Date() },
      ],
    });
    const { recap } = await getInternshipRecap('s1');
    expect(recap!.longestOnTimeStreak).toBe(2);
  });

  it('drafts never count toward the streak', async () => {
    seed({
      entries: [
        { weekNumber: 1, status: 'draft', submittedAt: null },
        { weekNumber: 2, status: 'draft', submittedAt: null },
      ],
    });
    const { recap } = await getInternshipRecap('s1');
    expect(recap!.longestOnTimeStreak).toBe(0);
  });

  it('ranks themes by frequency and caps the list', async () => {
    seed({
      activities: [
        { competencyTags: ['Testing', 'Debugging'] },
        { competencyTags: ['Testing'] },
        { competencyTags: ['Testing', 'Teamwork'] },
        { competencyTags: ['  '] }, // blank tags are ignored
      ],
    });
    const { recap } = await getInternshipRecap('s1');
    expect(recap!.themes[0]).toEqual({ tag: 'Testing', count: 3 });
    expect(recap!.themes.map((t) => t.tag)).not.toContain('');
    expect(recap!.themes.length).toBeLessThanOrEqual(6);
  });

  it('de-duplicates skills, most recent first', async () => {
    seed({
      days: [
        day('2026-03-02', 1, 'Lathe setup'),
        day('2026-03-03', 1, 'lathe setup'), // same skill, different case
        day('2026-03-04', 1, 'Welding'),
      ],
    });
    const { recap } = await getInternshipRecap('s1');
    expect(recap!.skills).toEqual(['Welding', 'lathe setup']);
  });

  it('truncates a long reflection instead of dumping an essay', async () => {
    seed({
      reflections: [{ challenges: 'x'.repeat(500), updatedAt: new Date() }],
    });
    const { recap } = await getInternshipRecap('s1');
    expect(recap!.challenges[0].length).toBeLessThanOrEqual(200);
    expect(recap!.challenges[0].endsWith('…')).toBe(true);
  });
});

describe('the sparse path — three entries must still read well', () => {
  it('produces a coherent recap with no division by zero and no empty scaffolding', async () => {
    seed({
      days: [
        day('2026-03-02', 1, 'Shadowed the technician'),
        day('2026-03-03', 1, null),
        day('2026-03-04', 1, null),
      ],
      entries: [{ weekNumber: 1, status: 'submitted', submittedAt: new Date() }],
      activities: [],
      reflections: [],
    });
    const { available, recap } = await getInternshipRecap('s1');
    expect(available).toBe(true);
    expect(recap!.totalEntries).toBe(3);
    expect(recap!.weeksCovered).toBe(1);
    expect(recap!.daysOnTime).toBe(3);
    expect(recap!.longestOnTimeStreak).toBe(1);
    // Cards with nothing to say return empty lists, so the UI can drop them
    // rather than render a heading over a blank.
    expect(recap!.themes).toEqual([]);
    expect(recap!.challenges).toEqual([]);
    expect(recap!.skills).toEqual(['Shadowed the technician']);
    for (const v of Object.values(recap!)) {
      expect(Number.isNaN(v as number)).toBe(false);
    }
  });

  it('a finalized placement with zero entries still returns a recap', async () => {
    seed({ days: [], entries: [], activities: [], reflections: [] });
    const { available, recap } = await getInternshipRecap('s1');
    expect(available).toBe(true);
    expect(recap!.totalEntries).toBe(0);
    expect(recap!.weeksCovered).toBe(0);
    expect(recap!.longestOnTimeStreak).toBe(0);
    expect(recap!.firstEntryDate).toBeNull();
  });
});

describe('confidentiality boundary', () => {
  it('touches no assessment, grade or enrichment table', async () => {
    seed({ days: [day('2026-03-02', 1, 'x')] });
    await getInternshipRecap('s1');
    const touched = Object.keys(prisma as object);
    for (const forbidden of ['assessmentIndustry', 'finalGrade', 'aiAssessment', 'entryEvent']) {
      expect(touched).not.toContain(forbidden);
    }
  });

  it('the source file names no forbidden table', () => {
    // A future edit that reaches across the sealed-envelope boundary fails here
    // rather than in review.
    const src = fs.readFileSync(path.join(__dirname, '..', 'recap.service.ts'), 'utf8');
    const body = src.slice(src.indexOf('export async function getInternshipRecap'));
    for (const forbidden of [
      'assessmentIndustry', 'assessment_industry',
      'finalGrade', 'final_grade',
      'aiAssessment', 'ai_assessment',
      'placementAssessment', 'weeklyComment',
      '$queryRaw', '$executeRaw',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });
});
