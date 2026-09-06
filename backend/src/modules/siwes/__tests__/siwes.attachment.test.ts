/**
 * The attachment's LENGTH, in isolation.
 *
 * The rest of the SIWES suite needs a real Postgres and skips on a box without
 * one — but the rule under test here is the one that shipped the "6 weeks
 * instead of 5" bug, so it is worth proving against mocks: the cohort's
 * configured `durationWeeks` is a ceiling on the attachment, not merely a
 * fallback for a placement with no end date.
 */
jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement:     { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    cohortConfig:  { findFirst: jest.fn() },
    nonWorkingDay: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../../entries/entries.policy', () => ({
  authorizePlacement: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../../config/prisma';
import { loadAttachmentContext } from '../siwes.service';
import type { Actor } from '../../entries/entries.policy';

const mp = prisma as unknown as {
  placement:    { findUniqueOrThrow: jest.Mock };
  cohortConfig: { findFirst: jest.Mock };
};

const actor: Actor = { id: 'stu-1', role: 'student' };
const iso = (d: Date) => d.toISOString().slice(0, 10);

function placement(endDate: string | null) {
  return {
    id:                    'p-1',
    studentId:             'stu-1',
    placementStatus:       'active',
    finalizationStatus:    'active',
    isCurrent:             true,
    academicYearId:        'ay-1',
    startDate:             new Date('2026-01-05T00:00:00.000Z'), // a Monday
    endDate:               endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
    supersedesPlacementId: null,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('loadAttachmentContext — attachment length', () => {
  it('clamps an over-long placement to the configured length', async () => {
    // Dates span six weeks; the cohort is configured for five. Before this the
    // dates won, so the logbook drew a six-week rail while the entries API
    // rejected week 6 with a 422.
    mp.placement.findUniqueOrThrow.mockResolvedValue(placement('2026-02-15'));
    mp.cohortConfig.findFirst.mockResolvedValue({ durationWeeks: 5 });

    const ctx = await loadAttachmentContext(actor, 'p-1', 'read');

    expect(ctx.durationWeeks).toBe(5);
    // Week 5 ends on Sunday 2026-02-08: start + 5*7 - 1 days.
    expect(iso(ctx.effectiveEnd)).toBe('2026-02-08');
  });

  it('keeps a placement that ends EARLIER than the configured length', async () => {
    // A placement cut short is genuinely shorter. The configuration is a
    // ceiling, not a floor — it must never extend an attachment past its end.
    mp.placement.findUniqueOrThrow.mockResolvedValue(placement('2026-01-25'));
    mp.cohortConfig.findFirst.mockResolvedValue({ durationWeeks: 5 });

    const ctx = await loadAttachmentContext(actor, 'p-1', 'read');

    expect(iso(ctx.effectiveEnd)).toBe('2026-01-25');
  });

  it('derives the end from the configured length when the placement has none', async () => {
    mp.placement.findUniqueOrThrow.mockResolvedValue(placement(null));
    mp.cohortConfig.findFirst.mockResolvedValue({ durationWeeks: 5 });

    const ctx = await loadAttachmentContext(actor, 'p-1', 'read');

    expect(iso(ctx.effectiveEnd)).toBe('2026-02-08');
  });

  it('falls back to the schema default when the cohort has no configuration', async () => {
    mp.placement.findUniqueOrThrow.mockResolvedValue(placement(null));
    mp.cohortConfig.findFirst.mockResolvedValue(null);

    const ctx = await loadAttachmentContext(actor, 'p-1', 'read');

    expect(ctx.durationWeeks).toBe(5);
  });
});
