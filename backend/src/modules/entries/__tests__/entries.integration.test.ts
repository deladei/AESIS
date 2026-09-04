/**
 * Integration tests for the weekly logbook pipeline against a REAL Postgres.
 *
 * Mocks can't prove the things that matter here — the FOR UPDATE lock behind
 * idempotent submit, the UNIQUE(placement, week) anchor, the append-only DB
 * trigger, and DB-level cross-student scoping — so these run against a dedicated
 * local test database (aesis_logbook_test). If the DB is unreachable the whole
 * suite is skipped rather than failing spuriously (e.g. on a machine with no PG).
 */
import dotenv from 'dotenv';

// Point the prisma singleton at the test DB BEFORE importing it. dotenv does not
// override already-set vars, so env.ts will keep this value.
dotenv.config();
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://u:p@127.0.0.1:5432/x');
base.hostname = '127.0.0.1';
base.pathname = '/aesis_logbook_test';
process.env.DATABASE_URL = base.toString();

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/errorHandler';
import {
  saveDraft,
  submitEntry,
  acknowledgeEntry,
  returnEntry,
  getEntry,
  getEntryTrail,
  listEntries,
} from '../entries.service';
import { saveDayDraft, submitDay } from '../entries.day.service';
import { processOne } from '../enrichment.worker';
import type { EnrichFn, EnrichmentResult, EnrichmentPayload } from '../enrichment.client';
import type { Actor } from '../entries.policy';
import {
  recordAssessment,
  finalizePlacement,
  inviteAttestation,
  getAttestationContext,
  submitAttestation,
} from '../../finalization/finalization.service';
import { hashAttestationToken } from '../../finalization/attestation.token';
import type {
  SummarizeFn,
  PlacementSummaryResult,
} from '../../finalization/placement.summary.client';
import { env } from '../../../config/env';

// Cold Prisma engine spin-up + TRUNCATE CASCADE + fixture seeding can exceed
// Jest's 5s default hook timeout on this weak box (see CLAUDE.md). Give the
// DB-integration hooks/tests room so a slow connect isn't read as a failure.
jest.setTimeout(60_000);

// ── Fixtures ──────────────────────────────────────────────────
let deptId: string;
let yearId: string;
let studentA: Actor;
let studentB: Actor;
let supervisorA: Actor;
let supervisorOther: Actor;
let coordinator: Actor;
let placementA: string;
let placementB: string;

let dbAvailable = true;

async function reachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function mkUser(role: Actor['role'], tag: string): Promise<Actor> {
  const u = await prisma.user.create({
    data: {
      email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@cs.edu.gh`,
      passwordHash: 'x',
      role: role as never,
      firstName: tag,
      lastName: 'Test',
      departmentId: deptId,
    },
  });
  return { id: u.id, role };
}

const week = (n: number) => ({
  placementId: '',
  weekNumber: n,
  periodStart: '2026-03-02',
  periodEnd: '2026-03-08',
  hoursLogged: 40,
  activities: [
    { activityDate: '2026-03-03', description: 'Built an API endpoint', competencyTags: ['backend'] },
  ],
  reflection: { learning: 'Learned Express', challenges: 'Auth was tricky', supervisorVisible: true },
});

beforeAll(async () => {
  dbAvailable = await reachable();
  if (!dbAvailable) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE cohort_configs, entry_event, entry_activity, entry_reflection, ai_assessment, enrichment_queue,
     logbook_entry, placement_assessment, company_attestation, placements, companies, notifications,
     users, academic_years, departments RESTART IDENTITY CASCADE`,
  );

  const dept = await prisma.department.create({ data: { name: 'Computer Science', code: 'CS' } });
  deptId = dept.id;
  const year = await prisma.academicYear.create({
    data: { label: '2025/2026', startDate: new Date('2025-09-01'), endDate: new Date('2026-08-31') },
  });
  yearId = year.id;

  // Week numbers are bounded by the cohort's configured attachment length, not
  // by a literal in the schema. Without a config row the default (6) applies
  // and this suite's higher week numbers are correctly rejected.
  await prisma.cohortConfig.create({
    data: { academicYearId: yearId, durationWeeks: 48 },
  });

  studentA = await mkUser('student', 'studentA');
  studentB = await mkUser('student', 'studentB');
  supervisorA = await mkUser('academic_supervisor', 'supA');
  supervisorOther = await mkUser('academic_supervisor', 'supOther');
  coordinator = await mkUser('coordinator', 'coord');

  const pa = await prisma.placement.create({
    data: { studentId: studentA.id, academicSupervisorId: supervisorA.id, academicYearId: yearId },
  });
  const pb = await prisma.placement.create({
    data: { studentId: studentB.id, academicSupervisorId: supervisorOther.id, academicYearId: yearId },
  });
  placementA = pa.id;
  placementB = pb.id;
});

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

// helper: skip body if DB missing
const itdb = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[skip] ${name} — test DB unreachable`);
      return;
    }
    await fn();
  });

async function eventsFor(entryId: string) {
  return prisma.entryEvent.findMany({ where: { entryId }, orderBy: { createdAt: 'asc' } });
}

// ── Write path ────────────────────────────────────────────────
describe('write path', () => {
  itdb('creates a draft with a genesis null->draft event, activities and reflection', async () => {
    const entry = await saveDraft(studentA, { ...week(1), placementId: placementA });
    expect(entry.status).toBe('draft');
    expect(entry.version).toBe(1);
    expect(entry.activities).toHaveLength(1);
    expect(entry.reflection?.learning).toBe('Learned Express');

    const ev = await eventsFor(entry.id);
    expect(ev).toHaveLength(1);
    expect(ev[0].fromStatus).toBeNull();
    expect(ev[0].toStatus).toBe('draft');
  });

  itdb('upserts by (placement, week) — re-saving does not create a second entry', async () => {
    const first = await saveDraft(studentA, { ...week(2), placementId: placementA });
    const second = await saveDraft(studentA, {
      ...week(2),
      placementId: placementA,
      activities: [
        { activityDate: '2026-03-04', description: 'Wrote tests', competencyTags: [] },
        { activityDate: '2026-03-05', description: 'Fixed a bug', competencyTags: [] },
      ],
    });
    expect(second.id).toBe(first.id);
    expect(second.activities).toHaveLength(2); // full replace
    const count = await prisma.logbookEntry.count({ where: { placementId: placementA, weekNumber: 2 } });
    expect(count).toBe(1);
  });

  itdb('rejects a future activity date with 422', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await expect(
      saveDraft(studentA, {
        ...week(3),
        placementId: placementA,
        activities: [{ activityDate: future, description: 'time travel', competencyTags: [] }],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  itdb('rejects logging a week that has not started yet with 422', async () => {
    const start = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    await expect(
      saveDraft(studentA, {
        ...week(30),
        placementId: placementA,
        periodStart: start,
        periodEnd: end,
        activities: [],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  itdb('rejects an activity dated outside the week period with 422', async () => {
    await expect(
      saveDraft(studentA, {
        ...week(31),
        placementId: placementA,
        activities: [
          // Week is 2026-03-02..08; this date is in the past but out of period.
          { activityDate: '2026-02-20', description: 'wrong week', competencyTags: [] },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  itdb('rejects submitting a week that has not started yet with 422 (defense in depth)', async () => {
    // saveDraft now blocks future weeks, so plant the draft row directly to
    // prove the submit-side guard holds on its own.
    const planted = await prisma.logbookEntry.create({
      data: {
        placementId: placementA,
        studentId: studentA.id,
        weekNumber: 32,
        periodStart: new Date(Date.now() + 14 * 86_400_000),
        periodEnd: new Date(Date.now() + 20 * 86_400_000),
        status: 'draft',
      },
    });
    await expect(submitEntry(studentA, planted.id)).rejects.toMatchObject({ statusCode: 422 });
  });

  itdb('submits a week with no activities (activity list is not a submission gate)', async () => {
    const entry = await saveDraft(studentA, { ...week(4), placementId: placementA, activities: [] });
    const submitted = await submitEntry(studentA, entry.id);
    expect(submitted.status).toBe('submitted');
    expect(submitted.activities).toHaveLength(0);
  });

  itdb('submit flips to submitted, writes one event and enqueues exactly one enrichment row', async () => {
    const draft = await saveDraft(studentA, { ...week(5), placementId: placementA });
    const submitted = await submitEntry(studentA, draft.id);
    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).not.toBeNull();

    const ev = await eventsFor(draft.id);
    expect(ev.map((e) => e.toStatus)).toEqual(['draft', 'submitted']);
    const q = await prisma.enrichmentQueue.findMany({ where: { entryId: draft.id } });
    expect(q).toHaveLength(1);
    expect(q[0].status).toBe('pending');
  });

  itdb('double-submit is idempotent: no second event, no second enqueue', async () => {
    const draft = await saveDraft(studentA, { ...week(6), placementId: placementA });
    await submitEntry(studentA, draft.id);
    await submitEntry(studentA, draft.id); // again
    const ev = await eventsFor(draft.id);
    expect(ev.filter((e) => e.toStatus === 'submitted')).toHaveLength(1);
    const q = await prisma.enrichmentQueue.count({ where: { entryId: draft.id } });
    expect(q).toBe(1);
  });
});

// ── Day submit vs week submit ─────────────────────────────────
// Students work two ways and both are offered: day by day, or write the week
// and send it whole. That choice is only real if neither path spends the other.
describe('the day path and the week path are independent', () => {
  const dayWeek = { ...week(44), placementId: '' };

  itdb('submitting a day marks the day and leaves the week a draft', async () => {
    const pingsBefore = await prisma.notification.count({ where: { userId: supervisorA.id } });
    const saved = await saveDayDraft(studentA, {
      ...dayWeek, placementId: placementA, date: '2026-03-03', activities: [],
    });
    const after = await submitDay(studentA, saved.id, '2026-03-03');

    // The day is final...
    const day = after.days.find((d) => iso(d.workDate) === '2026-03-03');
    expect(day?.status).toBe('submitted');
    expect(day?.submittedAt).not.toBeNull();

    // ...but the week is still the student's to send. Before this, the first
    // day submit flipped the week, which spent the week-level submit silently
    // and left the "Submit week" offer and the deadline job unreachable.
    expect(after.status).toBe('draft');
    expect((await eventsFor(saved.id)).filter((e) => e.toStatus === 'submitted')).toHaveLength(0);
    expect(await prisma.enrichmentQueue.count({ where: { entryId: saved.id } })).toBe(0);
    // And the supervisor is not pinged for a stray day — they hear about a week.
    expect(await prisma.notification.count({ where: { userId: supervisorA.id } }))
      .toBe(pingsBefore);
  });

  itdb('the week still submits normally afterwards, exactly once', async () => {
    const saved = await saveDayDraft(studentA, {
      ...dayWeek, weekNumber: 45, placementId: placementA, date: '2026-03-04', activities: [],
    });
    await submitDay(studentA, saved.id, '2026-03-04');
    const submitted = await submitEntry(studentA, saved.id);

    expect(submitted.status).toBe('submitted');
    expect((await eventsFor(saved.id)).filter((e) => e.toStatus === 'submitted')).toHaveLength(1);
    expect(await prisma.enrichmentQueue.count({ where: { entryId: saved.id } })).toBe(1);
  });
});

// ── What the logbook screen reads ─────────────────────────────
describe('getEntry gives the logbook what it renders', () => {
  itdb('sends day rows under the name the schema uses, with lateness derived', async () => {
    // The consolidation dropped `entry_days` (and its stored `logged_late`).
    // The SPA kept describing days by the OLD shape, so every day row read
    // `undefined.slice(...)` and the logbook white-screened. Assert the wire
    // shape, since TypeScript cannot: the client's interface is hand-written.
    const saved = await saveDayDraft(studentA, {
      ...week(46), placementId: placementA, date: '2026-03-05', activities: [],
    });
    const detail = await getEntry(studentA, saved.id);

    expect(detail.days).toHaveLength(1);
    const [day] = detail.days;
    expect(day).toHaveProperty('workDate');
    expect(day).not.toHaveProperty('date');
    // Logged months after the day itself — the reviewer must see that.
    expect(day.loggedLate).toBe(true);
    expect(day.lateByDays).toBeGreaterThan(0);
  });

  itdb('tells a draft week whether it could be submitted right now', async () => {
    const draft = await saveDraft(studentA, { ...week(47), placementId: placementA });
    const detail = await getEntry(studentA, draft.id);

    // The offer has to survive a reload, so it is on the read, not only on the
    // save that completed the week.
    expect(detail.completion).toBeDefined();
    expect(detail.completion?.complete).toBe(false);
    expect(detail.completion?.remaining).toBeGreaterThan(0);
  });

  itdb('does not offer a submitted week a submit button', async () => {
    const draft = await saveDraft(studentA, { ...week(48), placementId: placementA });
    await submitEntry(studentA, draft.id);
    const detail = await getEntry(studentA, draft.id);
    expect(detail.completion).toBeNull();
  });
});

// ── Human workflow + locking ──────────────────────────────────
describe('review workflow', () => {
  itdb('acknowledge locks the week: further edits 409', async () => {
    const draft = await saveDraft(studentA, { ...week(7), placementId: placementA });
    await submitEntry(studentA, draft.id);
    const ack = await acknowledgeEntry(supervisorA, draft.id, {});
    expect(ack.status).toBe('acknowledged');
    await expect(saveDraft(studentA, { ...week(7), placementId: placementA })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  itdb('return -> reopen bumps version and allows resubmission', async () => {
    const draft = await saveDraft(studentA, { ...week(8), placementId: placementA });
    await submitEntry(studentA, draft.id);
    const returned = await returnEntry(supervisorA, draft.id, { comment: 'Add more detail' });
    expect(returned.status).toBe('returned');

    // student edits the returned entry -> reopen to draft, version 2
    const reopened = await saveDraft(studentA, { ...week(8), placementId: placementA });
    expect(reopened.status).toBe('draft');
    expect(reopened.version).toBe(2);

    const resubmitted = await submitEntry(studentA, draft.id);
    expect(resubmitted.status).toBe('submitted');

    const toStatuses = (await eventsFor(draft.id)).map((e) => e.toStatus);
    expect(toStatuses).toEqual(['draft', 'submitted', 'returned', 'draft', 'submitted']);
  });

  itdb('a student is notified when their week is returned', async () => {
    const draft = await saveDraft(studentA, { ...week(9), placementId: placementA });
    await submitEntry(studentA, draft.id);
    await returnEntry(supervisorA, draft.id, { comment: 'redo' });
    const notif = await prisma.notification.findFirst({
      where: { userId: studentA.id, metadata: { path: ['entryId'], equals: draft.id } },
    });
    expect(notif).not.toBeNull();
  });
});

// ── Append-only event log ─────────────────────────────────────
describe('append-only event log', () => {
  itdb('the DB rejects UPDATE and DELETE on entry_event', async () => {
    const draft = await saveDraft(studentA, { ...week(10), placementId: placementA });
    const ev = (await eventsFor(draft.id))[0];
    await expect(
      prisma.$executeRawUnsafe(`UPDATE entry_event SET comment='x' WHERE id='${ev.id}'`),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM entry_event WHERE id='${ev.id}'`),
    ).rejects.toThrow();
  });
});

// ── Audit trail (actor role, event type, before/after) ────────
describe('audit trail', () => {
  itdb('records actor role + event type across the lifecycle, scoring on graded ack', async () => {
    const wasBinding = env.WEEKLY_BINDING_GRADES;
    (env as { WEEKLY_BINDING_GRADES: boolean }).WEEKLY_BINDING_GRADES = true;
    try {
      const draft = await saveDraft(studentA, { ...week(40), placementId: placementA });
      await submitEntry(studentA, draft.id);
      await acknowledgeEntry(supervisorA, draft.id, { score: 88 });

      const ev = await eventsFor(draft.id);
      expect(ev.map((e) => e.eventType)).toEqual(['created', 'transitioned', 'scored']);
      // created + submit were the student; the graded ack was the supervisor.
      expect(ev.map((e) => e.actorRole)).toEqual([
        'student', 'student', 'academic_supervisor',
      ]);
      expect(Number(ev[2].score)).toBe(88);
    } finally {
      (env as { WEEKLY_BINDING_GRADES: boolean }).WEEKLY_BINDING_GRADES = wasBinding;
    }
  });

  itdb('a plain draft edit emits an `edited` event with before/after snapshots', async () => {
    await saveDraft(studentA, { ...week(41), placementId: placementA }); // genesis: 1 activity
    const edited = await saveDraft(studentA, {
      ...week(41),
      placementId: placementA,
      hoursLogged: 35,
      activities: [
        { activityDate: '2026-03-04', description: 'Wrote tests', competencyTags: ['qa'] },
        { activityDate: '2026-03-05', description: 'Code review', competencyTags: ['review'] },
      ],
    });

    const ev = await eventsFor(edited.id);
    expect(ev.map((e) => e.eventType)).toEqual(['created', 'edited']);

    const editEvent = ev[1];
    expect(editEvent.fromStatus).toBeNull();
    expect(editEvent.toStatus).toBeNull();
    const before = editEvent.before as { activities: unknown[]; hoursLogged: number };
    const after = editEvent.after as { activities: unknown[]; hoursLogged: number };
    expect(before.activities).toHaveLength(1);
    expect(after.activities).toHaveLength(2);
    expect(before.hoursLogged).toBe(40);
    expect(after.hoursLogged).toBe(35);
  });

  itdb('getEntryTrail returns the events oldest-first with actor name + role', async () => {
    const draft = await saveDraft(studentA, { ...week(42), placementId: placementA });
    await submitEntry(studentA, draft.id);
    await returnEntry(supervisorA, draft.id, { comment: 'add detail' });

    const trail = await getEntryTrail(studentA, draft.id);
    expect(trail.map((t) => t.eventType)).toEqual(['created', 'transitioned', 'transitioned']);
    expect(trail[0].actor.role).toBe('student');
    expect(trail[0].actor.name).toContain('studentA');
    expect(trail[2].actor.role).toBe('academic_supervisor');
    expect(trail[2].comment).toBe('add detail');
    // oldest-first ordering
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i].createdAt.getTime()).toBeGreaterThanOrEqual(trail[i - 1].createdAt.getTime());
    }
  });

  itdb('getEntryTrail denies a student reading another student’s trail (403)', async () => {
    const draft = await saveDraft(studentA, { ...week(43), placementId: placementA });
    await expect(getEntryTrail(studentB, draft.id)).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── Cross-student / role isolation ────────────────────────────
describe('authorization & isolation', () => {
  let entryAId: string;
  beforeAll(async () => {
    if (!dbAvailable) return;
    const e = await saveDraft(studentA, { ...week(20), placementId: placementA });
    await submitEntry(studentA, e.id);
    entryAId = e.id;
  });

  itdb('student B cannot read student A’s entry (DB-scoped -> 404)', async () => {
    await expect(getEntry(studentB, entryAId)).rejects.toMatchObject({ statusCode: 404 });
  });

  itdb('student B cannot submit/transition student A’s entry (403)', async () => {
    const draft = await saveDraft(studentA, { ...week(21), placementId: placementA });
    await expect(submitEntry(studentB, draft.id)).rejects.toMatchObject({ statusCode: 403 });
  });

  itdb('student B cannot write a draft on student A’s placement (403)', async () => {
    await expect(
      saveDraft(studentB, { ...week(22), placementId: placementA }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  itdb('a supervisor who does not supervise the placement cannot acknowledge (403)', async () => {
    await expect(acknowledgeEntry(supervisorOther, entryAId, {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  itdb('coordinator can read but cannot transition (403)', async () => {
    const read = await getEntry(coordinator, entryAId);
    expect(read.id).toBe(entryAId);
    await expect(acknowledgeEntry(coordinator, entryAId, {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  itdb('list is DB-scoped: student A sees only their own placement’s entries', async () => {
    const { entries } = await listEntries(studentA, { page: 1, limit: 100 });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.placementId === placementA)).toBe(true);
    const bList = await listEntries(studentB, { page: 1, limit: 100 });
    expect(bList.entries.every((e) => e.placementId === placementB)).toBe(true);
  });
});

// ── Path 2 — AI enrichment worker (fail-open) ─────────────────
// Lives in this file (not a separate suite) so it shares the one test DB without
// racing the other suite's TRUNCATE. The model is injected, so no live FastAPI.
describe('AI enrichment (Path 2)', () => {
  const goodResult: EnrichmentResult = {
    model_name: 'test-model/v1',
    relevance: 0.9,
    summary: { headline: 'looks good', themes: ['software_engineering'], activity_relevance: [], concerns: [] },
  };
  const okEnrich: EnrichFn = async () => goodResult;
  const downEnrich: EnrichFn = async () => {
    throw new Error('AI engine unreachable');
  };

  // A clean queue per test so processOne deterministically claims THIS test's job
  // and not a leftover from the write-path tests above.
  beforeEach(async () => {
    if (!dbAvailable) return;
    await prisma.aiAssessment.deleteMany({});
    await prisma.enrichmentQueue.deleteMany({});
  });

  async function submitFreshWeek(n: number): Promise<string> {
    const draft = await saveDraft(studentA, { ...week(n), placementId: placementA });
    await submitEntry(studentA, draft.id);
    return draft.id;
  }

  itdb('happy path: writes exactly one ai_assessment and marks the job succeeded', async () => {
    const entryId = await submitFreshWeek(30);
    expect(await processOne(okEnrich)).toBe(true);

    const assessments = await prisma.aiAssessment.findMany({ where: { entryId } });
    expect(assessments).toHaveLength(1);
    expect(Number(assessments[0].relevance)).toBeCloseTo(0.9);
    const job = await prisma.enrichmentQueue.findFirst({ where: { entryId } });
    expect(job?.status).toBe('succeeded');
    expect(job?.lockedAt).toBeNull();
  });

  itdb('enrichment never mutates logbook_entry.status', async () => {
    const entryId = await submitFreshWeek(31);
    await processOne(okEnrich);
    const entry = await prisma.logbookEntry.findUnique({ where: { id: entryId } });
    expect(entry?.status).toBe('submitted');
  });

  itdb('returns false when no job is due', async () => {
    expect(await processOne(okEnrich)).toBe(false);
  });

  itdb('fail-open: a down AI engine leaves the entry reviewable with NO assessment', async () => {
    const entryId = await submitFreshWeek(32);
    await processOne(downEnrich);
    const entry = await prisma.logbookEntry.findUnique({ where: { id: entryId } });
    expect(entry?.status).toBe('submitted'); // human review not blocked
    expect(await prisma.aiAssessment.count({ where: { entryId } })).toBe(0);
  });

  itdb('transient failure schedules a backoff retry (not abandon)', async () => {
    const entryId = await submitFreshWeek(33);
    await processOne(downEnrich);
    const job = await prisma.enrichmentQueue.findFirst({ where: { entryId } });
    expect(job?.status).toBe('failed');
    expect(job?.attempts).toBe(1);
    expect(job?.lastError).toContain('unreachable');
    expect(job!.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  itdb('gives up (abandoned) after maxAttempts, still never blocking review', async () => {
    const entryId = await submitFreshWeek(34);
    await prisma.enrichmentQueue.updateMany({
      where: { entryId },
      data: { attempts: 4, maxAttempts: 5, nextRunAt: new Date(Date.now() - 1000) },
    });
    await processOne(downEnrich); // attempt -> 5, fail, attempts >= max -> abandon
    const job = await prisma.enrichmentQueue.findFirst({ where: { entryId } });
    expect(job?.status).toBe('abandoned');
    const entry = await prisma.logbookEntry.findUnique({ where: { id: entryId } });
    expect(entry?.status).toBe('submitted');
  });

  itdb('a recovered AI engine succeeds on the retry after a prior failure', async () => {
    const entryId = await submitFreshWeek(35);
    await processOne(downEnrich); // fail once
    await prisma.enrichmentQueue.updateMany({
      where: { entryId },
      data: { nextRunAt: new Date(Date.now() - 1000) },
    });
    await processOne(okEnrich); // now succeeds
    const job = await prisma.enrichmentQueue.findFirst({ where: { entryId } });
    expect(job?.status).toBe('succeeded');
    expect(await prisma.aiAssessment.count({ where: { entryId } })).toBe(1);
  });

  // ── v2 report fields: persistence + role-scoped redaction ──────────────
  const reportResult: EnrichmentResult = {
    ...goodResult,
    quality: {
      overall: 38.9,
      task_depth: 53.3,
      tech_vocab: 36.2,
      reflection: 35.3,
      temporal_consistency: 25,
      relevance: 100,
      flags: ['low_cs_relevance'],
      feedback: 'Use chronological language.',
    },
    plagiarism: {
      checked: true,
      corpus_size: 3,
      max_similarity: 0.87,
      flagged: true,
      matches: [
        {
          entry_id: 'someone-elses-entry',
          similarity: 0.87,
          tfidf_similarity: 0.87,
          semantic_similarity: null,
          same_student: false,
        },
      ],
    },
    feedback_draft: { text: 'Solid API work this week.', model: 'llama-3.1-8b-instant' },
  };

  itdb('persists v2 report fields; getEntry redacts plagiarism + draft for the student', async () => {
    const entryId = await submitFreshWeek(36);
    await processOne(async () => reportResult);

    const supervisorView = await getEntry(supervisorA, entryId);
    const supAssessment = supervisorView.assessments[0] as any;
    expect(supAssessment.quality.overall).toBeCloseTo(38.9);
    expect(supAssessment.plagiarism.flagged).toBe(true);
    expect(supAssessment.feedbackDraft.text).toContain('API');

    const studentView = await getEntry(studentA, entryId);
    const stuAssessment = studentView.assessments[0] as any;
    expect(stuAssessment.quality.overall).toBeCloseTo(38.9); // quality stays visible
    expect(stuAssessment.plagiarism).toBeNull();
    expect(stuAssessment.feedbackDraft).toBeNull();
  });

  itdb("payload corpus carries other students' submitted entries, never the candidate", async () => {
    const otherDraft = await saveDraft(studentB, { ...week(37), placementId: placementB });
    await submitEntry(studentB, otherDraft.id);
    const entryId = await submitFreshWeek(38);

    const payloads: EnrichmentPayload[] = [];
    const capture: EnrichFn = async (p) => {
      payloads.push(p);
      return goodResult;
    };
    await processOne(capture); // studentB's job
    await processOne(capture); // studentA's job

    const mine = payloads.find((p) => p.entry_id === entryId);
    expect(mine).toBeDefined();
    const ids = mine!.corpus.map((d) => d.entry_id);
    expect(ids).toContain(otherDraft.id); // another student's submitted entry
    expect(ids).not.toContain(entryId); // never compares against itself

    const doc = mine!.corpus.find((d) => d.entry_id === otherDraft.id)!;
    expect(doc.same_student).toBe(false);
    expect(doc.text).toContain('Built an API endpoint'); // activities + reflection text
    expect(doc.text).toContain('Learned Express');
    // studentA's own earlier submitted weeks appear tagged same_student.
    expect(mine!.corpus.some((d) => d.same_student)).toBe(true);
  });
});

// ── Stage 5 — Placement finalization ──────────────────────────
describe('placement finalization', () => {
  const okSummary: PlacementSummaryResult = {
    model_name: 'test-xweek/v1',
    summary: { headline: 'solid placement', themes: ['software_engineering'], week_count: 1, recommendations: [] },
  };
  const okSummarize: SummarizeFn = async () => okSummary;
  const downSummarize: SummarizeFn = async () => {
    throw new Error('AI engine unreachable');
  };

  // Fresh placement under supervisorA so week states are fully controlled.
  // It needs its OWN student: weeks are keyed on (studentId, weekNumber) since
  // the consolidation, so reusing studentA here would collide with the weeks
  // the earlier blocks wrote under placementA.
  let pid: string;
  let studentF: Actor;
  async function ackWeek(placementId: string, student: Actor, n: number): Promise<void> {
    const draft = await saveDraft(student, { ...week(n), placementId });
    await submitEntry(student, draft.id);
    await acknowledgeEntry(supervisorA, draft.id, {});
  }
  // Each case gets its own student: one current placement per student (partial
  // unique index) AND one week N per student (the consolidated key), so cases
  // cannot share a student without colliding on both.
  async function freshCase(tag: string): Promise<{ pid: string; student: Actor }> {
    const student = await mkUser('student', tag);
    const p = await prisma.placement.create({
      data: { studentId: student.id, academicSupervisorId: supervisorA.id, academicYearId: yearId },
    });
    return { pid: p.id, student };
  }

  beforeAll(async () => {
    if (!dbAvailable) return;
    const base = await freshCase('studentF');
    pid = base.pid;
    studentF = base.student;
    await ackWeek(pid, studentF, 1);
  });

  itdb('finalize is blocked (409) until an assessment is recorded', async () => {
    await expect(finalizePlacement(supervisorA, pid, { waivers: [] }, okSummarize)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  itdb('recording an assessment moves the placement active -> assessment_pending', async () => {
    await recordAssessment(supervisorA, pid, { grade: 'A', narrative: 'Strong work' });
    const p = await prisma.placement.findUnique({ where: { id: pid } });
    expect(p?.finalizationStatus).toBe('assessment_pending');
  });

  itdb('only the assigned academic supervisor may assess (student/other-supervisor 403)', async () => {
    await expect(recordAssessment(studentA, pid, { grade: 'A' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(recordAssessment(supervisorOther, pid, { grade: 'A' })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  itdb('finalize is blocked (409) naming any week that is neither acknowledged nor waived', async () => {
    const draft = await saveDraft(studentF, { ...week(2), placementId: pid });
    await submitEntry(studentF, draft.id); // submitted, not acknowledged
    await recordAssessment(supervisorA, pid, { grade: 'A' });
    await expect(finalizePlacement(supervisorA, pid, { waivers: [] }, okSummarize)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  itdb('finalize succeeds with a recorded waiver + stores the cross-week summary', async () => {
    const result = await finalizePlacement(
      supervisorA,
      pid,
      { waivers: [{ weekNumber: 2, reason: 'Student left placement early — agreed with coordinator' }] },
      okSummarize,
    );
    expect(result.finalizedAt).not.toBeNull();
    expect((result.crossWeekSummary as { headline: string }).headline).toBe('solid placement');
    expect((result.waivers as { weekNumber: number; reason: string; waivedBy: string }[])[0]).toMatchObject({
      weekNumber: 2,
      waivedBy: supervisorA.id,
    });
    const p = await prisma.placement.findUnique({ where: { id: pid } });
    expect(p?.finalizationStatus).toBe('finalized');
  });

  itdb('re-finalizing a finalized placement is rejected (409)', async () => {
    await expect(finalizePlacement(supervisorA, pid, { waivers: [] }, okSummarize)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  itdb('finalize is fail-open on the AI summary — a down engine still finalizes (no summary)', async () => {
    const { pid: p2, student } = await freshCase('studentAiDown');
    await ackWeek(p2, student, 1);
    await recordAssessment(supervisorA, p2, { grade: 'B' });
    const result = await finalizePlacement(supervisorA, p2, { waivers: [] }, downSummarize);
    expect(result.finalizedAt).not.toBeNull();
    expect(result.crossWeekSummary).toBeNull(); // advisory; absent, but finalize still succeeded
  });

  itdb('a student cannot finalize (403)', async () => {
    const { pid: p3, student } = await freshCase('studentNoFinalize');
    await ackWeek(p3, student, 1);
    await recordAssessment(supervisorA, p3, { grade: 'B' });
    // The owning student — role denial, not an ownership miss.
    await expect(finalizePlacement(student, p3, { waivers: [] }, okSummarize)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  itdb('honours COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION when enabled', async () => {
    const { pid: p4, student } = await freshCase('studentAttest');
    await ackWeek(p4, student, 1);
    await recordAssessment(supervisorA, p4, { grade: 'B' });
    const prev = env.COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION;
    (env as { COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION: boolean }).COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION = true;
    try {
      await expect(finalizePlacement(supervisorA, p4, { waivers: [] }, okSummarize)).rejects.toMatchObject({
        statusCode: 409,
      });
    } finally {
      (env as { COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION: boolean }).COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION = prev;
    }
  });
});

// ── Stage 5 — Company magic-link attestation (no account) ─────
describe('company attestation (magic link)', () => {
  let pid: string;
  beforeAll(async () => {
    if (!dbAvailable) return;
    const company = await prisma.company.create({ data: { name: 'Hubtel Ghana' } });
    const p = await prisma.placement.create({
      data: {
        studentId: studentA.id,
        academicSupervisorId: supervisorA.id,
        academicYearId: yearId,
        companyId: company.id,
        // One current placement per student (partial unique index): studentA's
        // current slot is placementA.
        isCurrent: false,
      },
    });
    pid = p.id;
  });

  itdb('invite returns a raw token but stores ONLY its hash', async () => {
    const { token, url } = await inviteAttestation(supervisorA, pid);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(url).toContain(`/attest/${token}`);
    const row = await prisma.companyAttestation.findUnique({ where: { placementId: pid } });
    expect(row?.magicLinkTokenHash).toBe(hashAttestationToken(token));
    expect(row?.magicLinkTokenHash).not.toBe(token); // raw token never persisted
  });

  itdb('a student cannot invite an attestation (403); a coordinator can', async () => {
    await expect(inviteAttestation(studentA, pid)).rejects.toMatchObject({ statusCode: 403 });
    const { token } = await inviteAttestation(coordinator, pid);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  itdb('the public context + submit flow works and is single-use', async () => {
    const { token } = await inviteAttestation(supervisorA, pid);
    const ctx = await getAttestationContext(token);
    expect(ctx.organisation).toBe('Hubtel Ghana');
    expect(ctx.student).toContain('studentA');

    const submitted = await submitAttestation(token, { confirmed: true, comment: 'Confirmed — good intern' });
    expect(submitted.confirmed).toBe(true);
    expect(submitted.attestedAt).not.toBeNull();

    // single-use: the token is now spent
    await expect(getAttestationContext(token)).rejects.toMatchObject({ statusCode: 410 });
    await expect(submitAttestation(token, { confirmed: true })).rejects.toMatchObject({ statusCode: 410 });
  });

  itdb('an invalid token is rejected (404)', async () => {
    await expect(getAttestationContext('deadbeef'.repeat(8))).rejects.toMatchObject({ statusCode: 404 });
  });

  itdb('an expired token is rejected (410)', async () => {
    const { token } = await inviteAttestation(supervisorA, pid);
    await prisma.companyAttestation.update({
      where: { placementId: pid },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(getAttestationContext(token)).rejects.toMatchObject({ statusCode: 410 });
  });
});
