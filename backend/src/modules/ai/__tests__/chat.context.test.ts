jest.mock('../../student/student.service', () => ({ getStudentDashboard: jest.fn() }));
jest.mock('../../../config/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

import { buildStudentContext } from '../chat.context';
import { getStudentDashboard } from '../../student/student.service';

const mockDashboard = getStudentDashboard as jest.Mock;

/**
 * The record is an enhancement; answering the question is the product. Every
 * test here is about that ordering — nothing the dashboard does may stop the
 * assistant replying, and nothing advisory may be dressed up as a grade.
 */
describe('buildStudentContext', () => {
  beforeEach(() => mockDashboard.mockReset());

  const active = {
    hasActivePlacement: true,
    profile: { programme: 'B.Sc. Computer Science', department: 'Computer Science' },
    week: { current: 3, total: 6 },
    logsSubmitted: 2,
    expectedLogs: 6,
    completionPct: 40,
    avgQualityScore: 72.5,
    hours: { logged: 60, expected: 80 },
    tasks: { done: 4, total: 9 },
    supervisors: { academic: { name: 'Kwame Mensah' }, company: { name: 'Ama Boateng', organization: 'Hubtel' } },
    nextReview: { scheduledAt: '2026-09-20T09:00:00.000Z' },
    statusBreakdown: { draft: 1, submitted: 0, acknowledged: 2, returned: 1 },
    objectives: [{ id: 'o1', title: 'Ship a REST API', confirmedEntryCount: 2 }],
  };

  it('renders the figures the dashboard already computed', async () => {
    mockDashboard.mockResolvedValue(active);
    const out = await buildStudentContext('s1');

    expect(out).toContain('Current week: 3 of 6');
    expect(out).toContain('Weeks submitted: 2 of 6');
    expect(out).toContain('40%');
    expect(out).toContain('Kwame Mensah');
  });

  it('labels the AI score as advisory wherever it appears', async () => {
    // It reaches a student through the assistant, so it must never read as a mark.
    mockDashboard.mockResolvedValue(active);
    const out = await buildStudentContext('s1');
    expect(out).toMatch(/advisory only, not a grade/i);
  });

  it('calls out a returned week, which is the thing waiting on the student', async () => {
    mockDashboard.mockResolvedValue(active);
    expect(await buildStudentContext('s1')).toMatch(/RETURNED/);
  });

  it('says so plainly when there is no active placement', async () => {
    mockDashboard.mockResolvedValue({ ...active, hasActivePlacement: false });
    const out = await buildStudentContext('s1');
    expect(out).toContain('no active placement');
    expect(out).not.toContain('Current week');
  });

  it('answers with no record rather than failing when the dashboard throws', async () => {
    mockDashboard.mockRejectedValue(new Error('db down'));
    await expect(buildStudentContext('s1')).resolves.toBe('');
  });

  it('gives up on a slow dashboard instead of delaying the whole reply', async () => {
    // This runs before the SSE headers go out: a slow query does not degrade
    // the answer, it withholds it, and the caller reports the assistant as
    // unavailable for what is really a slow query.
    jest.useFakeTimers();
    mockDashboard.mockReturnValue(new Promise(() => { /* never settles */ }));

    const pending = buildStudentContext('s1');
    await jest.advanceTimersByTimeAsync(2_500);
    await expect(pending).resolves.toBe('');

    jest.useRealTimers();
  });
});
