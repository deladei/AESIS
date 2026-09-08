/**
 * The weekly-feedback link, issued from the same panel as the industry score.
 *
 * The two sit together and are not the same thing: the industry score is the
 * confidential end-of-placement mark the student never sees; this is formative,
 * scoped to one week, and the student reads it. What is tested here is that the
 * link is scoped to the right week and that it refuses rather than guessing.
 */
const mockPrisma = {
  placement:          { findUnique: jest.fn() },
  industrySupervisor: { findFirst: jest.fn() },
  logbookEntry:       { findFirst: jest.fn() },
};
const issueAssessmentToken = jest.fn();

jest.mock('../../../config/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../industry/industry.token', () => ({ issueAssessmentToken }));
jest.mock('../grades.policy', () => ({
  loadGradeOwnership: jest.fn().mockResolvedValue({}),
  assertCanReadGrade: jest.fn(),
  assertCanScoreComponent: jest.fn(),
  assertCanManageGrade: jest.fn(),
  serializeGrade: jest.fn(),
}));
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { inviteWeeklyComment } from '../grades.service';
import type { Actor } from '../../entries/entries.policy';

const COORD: Actor = { id: 'co-1', role: 'coordinator' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.industrySupervisor.findFirst.mockResolvedValue({
    id: 'isup-1', name: 'Mr Boateng', email: 'boateng@company.com',
  });
  issueAssessmentToken.mockResolvedValue({
    token: 'raw', url: 'https://aesis.vercel.app/weekly-comment/raw',
    tokenId: 't-1', expiresAt: '2026-09-15T00:00:00.000Z', emailedTo: null,
  });
});

describe('inviteWeeklyComment', () => {
  it('scopes the link to the newest SUBMITTED week', async () => {
    // That is the week a supervisor would actually be commenting on.
    mockPrisma.logbookEntry.findFirst.mockResolvedValueOnce({ weekNumber: 4 });

    const res = await inviteWeeklyComment(COORD, 'p-1');

    expect(res.weekNumber).toBe(4);
    expect(issueAssessmentToken).toHaveBeenCalledWith(COORD, 'isup-1', {
      purpose: 'weekly_comment', weekNumber: 4, send: false,
    });
  });

  it('falls back to the newest week of any status before anything is submitted', async () => {
    mockPrisma.logbookEntry.findFirst
      .mockResolvedValueOnce(null)          // nothing submitted
      .mockResolvedValueOnce({ weekNumber: 1 });

    const res = await inviteWeeklyComment(COORD, 'p-1');
    expect(res.weekNumber).toBe(1);
  });

  it('honours an explicit week without looking one up', async () => {
    const res = await inviteWeeklyComment(COORD, 'p-1', { weekNumber: 2 });

    expect(res.weekNumber).toBe(2);
    expect(mockPrisma.logbookEntry.findFirst).not.toHaveBeenCalled();
  });

  it('refuses when no company supervisor is on record', async () => {
    // Minting a token nobody can be sent is worse than saying so.
    mockPrisma.industrySupervisor.findFirst.mockResolvedValue(null);

    await expect(inviteWeeklyComment(COORD, 'p-1')).rejects.toMatchObject({ statusCode: 422 });
    expect(issueAssessmentToken).not.toHaveBeenCalled();
  });

  it('refuses when the intern has no logbook weeks at all', async () => {
    mockPrisma.logbookEntry.findFirst.mockResolvedValue(null);

    await expect(inviteWeeklyComment(COORD, 'p-1')).rejects.toMatchObject({ statusCode: 422 });
    expect(issueAssessmentToken).not.toHaveBeenCalled();
  });

  it('takes the most recent supervisor when a placement has had several', async () => {
    await inviteWeeklyComment(COORD, 'p-1', { weekNumber: 3 });

    expect(mockPrisma.industrySupervisor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('delegates authorization rather than re-deciding it', async () => {
    // issueAssessmentToken already allows staff or the ASSIGNED academic
    // supervisor. A second copy of that rule here would drift from it.
    const sup: Actor = { id: 'sup-9', role: 'academic_supervisor' };
    issueAssessmentToken.mockRejectedValue(
      Object.assign(new Error('Not permitted'), { statusCode: 403 }),
    );

    await expect(inviteWeeklyComment(sup, 'p-1', { weekNumber: 1 }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('does not email unless asked', async () => {
    await inviteWeeklyComment(COORD, 'p-1', { weekNumber: 1 });
    expect(issueAssessmentToken).toHaveBeenCalledWith(
      COORD, 'isup-1', expect.objectContaining({ send: false }),
    );
  });
});
