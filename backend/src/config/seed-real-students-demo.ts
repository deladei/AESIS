/**
 * Demo seed (REAL students) — wires already-registered student accounts to a
 * real supervisor so BOTH the student dashboards and that supervisor's Pulse
 * Board / AI Alerts / review queue render from actual prod accounts.
 *
 * Unlike seed-supervisor-demo.ts (which creates fictional interns), this script
 * only ever LOOKS UP the supervisor + students by email — it never creates or
 * renames a real account. It just gives each student an active placement under
 * the supervisor plus 6 weeks of logbook data + a latest risk score.
 *
 * Idempotent: re-running updates the same placements/weeks/risk in place.
 *
 * Run:  SUPERVISOR_EMAIL=theowalls@gmail.com npx ts-node src/config/seed-real-students-demo.ts
 *       (SUPERVISOR_EMAIL defaults to theowalls@gmail.com if unset)
 */
import { PrismaClient, EntryStatus, RiskTier } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

const SUPERVISOR_EMAIL = (process.env.SUPERVISOR_EMAIL ?? 'theowalls@gmail.com').toLowerCase();
const COMPANY_NAME = 'Sankofa Software Ltd.';

// The live week states. `under_review` and `flagged` were legacy submission
// statuses with no equivalent on `logbook_entry`: a week under review is simply
// `submitted`, and a flagged one is `returned`.
const A = EntryStatus.acknowledged;
const S = EntryStatus.submitted;
const R = EntryStatus.returned;
const D = EntryStatus.draft;

interface StudentSpec {
  email: string;
  weeks: { status: EntryStatus; quality: number | null }[];
  risk: { tier: RiskTier; score: number; factors: string[] };
}

// The 4 real registered students. A varied spread so the supervisor board shows
// a top performer through to a high-risk case. Names come from each student's
// own registration — never overwritten here.
const STUDENTS: StudentSpec[] = [
  {
    email: 'ginginger@gmail.com',
    weeks: [
      { status: A, quality: 90 }, { status: A, quality: 93 }, { status: A, quality: 91 },
      { status: A, quality: 95 }, { status: A, quality: 94 }, { status: S, quality: 92 },
    ],
    risk: { tier: RiskTier.low, score: 0.12, factors: ['Consistent submissions', 'High reflection quality'] },
  },
  {
    email: 'jamescastle@gmail.com',
    weeks: [
      { status: A, quality: 78 }, { status: A, quality: 81 }, { status: A, quality: 80 },
      { status: A, quality: 83 }, { status: A, quality: 82 }, { status: S, quality: 82 },
    ],
    risk: { tier: RiskTier.low, score: 0.30, factors: ['Steady engagement', 'On-time submissions'] },
  },
  {
    email: 'naanana@gmail.com',
    weeks: [
      { status: A, quality: 72 }, { status: A, quality: 74 }, { status: A, quality: 73 },
      { status: A, quality: 76 }, { status: S, quality: 74 }, { status: D, quality: null },
    ],
    risk: { tier: RiskTier.medium, score: 0.55, factors: ['Quality plateauing', 'One missed deadline'] },
  },
  {
    email: 'okoaddo@gmail.com',
    weeks: [
      { status: A, quality: 52 }, { status: A, quality: 48 }, { status: R, quality: 41 },
      { status: D, quality: null }, { status: D, quality: null }, { status: D, quality: null },
    ],
    risk: { tier: RiskTier.high, score: 0.82, factors: ['Missed 3 submissions', 'Quality below threshold', 'Engagement dropping 45%'] },
  },
];

async function main() {
  console.log(`🌱 Wiring real students to supervisor ${SUPERVISOR_EMAIL}...`);

  const academicYear = await prisma.academicYear.findFirstOrThrow({ where: { isActive: true } });
  const supervisor = await prisma.user.findUniqueOrThrow({ where: { email: SUPERVISOR_EMAIL } });
  if (supervisor.role !== 'academic_supervisor' && supervisor.role !== 'admin') {
    throw new Error(`User ${SUPERVISOR_EMAIL} is role '${supervisor.role}', not a supervisor.`);
  }
  console.log(`✓ Supervisor: ${supervisor.firstName} ${supervisor.lastName} (${supervisor.email})`);

  const company = await prisma.company.upsert({
    where: { name: COMPANY_NAME },
    update: {},
    create: { name: COMPANY_NAME, industry: 'Software', website: 'https://sankofa.example.com' },
  });
  console.log(`✓ Company: ${company.name}`);

  const startDate = new Date('2025-01-13'); // a Monday

  for (const spec of STUDENTS) {
    const student = await prisma.user.findUnique({ where: { email: spec.email } });
    if (!student) {
      console.warn(`⚠ Skipping ${spec.email} — no such registered user`);
      continue;
    }
    if (student.role !== 'student') {
      console.warn(`⚠ Skipping ${spec.email} — role is '${student.role}', not student`);
      continue;
    }

    // One active placement per student under this supervisor (idempotent).
    let placement = await prisma.placement.findFirst({
      where: { studentId: student.id, academicYearId: academicYear.id },
    });
    if (placement) {
      placement = await prisma.placement.update({
        where: { id: placement.id },
        data: {
          academicSupervisorId: supervisor.id,
          companyId: company.id,
          placementStatus: 'active',
          startDate,
          endDate: new Date('2025-06-30'),
          approvedAt: new Date(),
        },
      });
    } else {
      placement = await prisma.placement.create({
        data: {
          studentId: student.id,
          academicSupervisorId: supervisor.id,
          companyId: company.id,
          academicYearId: academicYear.id,
          placementStatus: 'active',
          startDate,
          endDate: new Date('2025-06-30'),
          approvedAt: new Date(),
        },
      });
    }

    // Logbook weeks (+ AI assessment where scored).
    //
    // These used to be written to `logbook_submission`, which is retired — the
    // seed produced rows no screen in the app could see. Weeks now go to
    // `logbook_entry` and scores to `ai_assessment`, the tables the dashboards
    // actually read.
    for (let i = 0; i < spec.weeks.length; i++) {
      const week = i + 1;
      const { status, quality } = spec.weeks[i];
      const periodStart = new Date(startDate.getTime() + i * 7 * 86_400_000);
      const periodEnd   = new Date(periodStart.getTime() + 6 * 86_400_000);
      const submittedAt = status === D ? null : new Date(periodEnd.getTime() - 86_400_000);

      const entry = await prisma.logbookEntry.upsert({
        where:  { studentId_weekNumber: { studentId: student.id, weekNumber: week } },
        update: { placementId: placement.id, status, submittedAt, periodStart, periodEnd },
        create: {
          placementId: placement.id,
          studentId:   student.id,
          weekNumber:  week,
          status,
          submittedAt,
          periodStart,
          periodEnd,
          hoursLogged: 40,
        },
      });

      // ai_assessment has no unique key on entryId, so re-running replaces
      // rather than upserts — keeps the seed idempotent.
      await prisma.aiAssessment.deleteMany({ where: { entryId: entry.id } });
      if (quality != null) {
        await prisma.aiAssessment.create({
          data: {
            entryId:   entry.id,
            modelName: 'seed/demo',
            quality:   { overall: quality },
          },
        });
      }
    }

    // Latest risk score (dashboard reads the most recent by computedAt).
    await prisma.studentRiskScore.deleteMany({ where: { placementId: placement.id } });
    await prisma.studentRiskScore.create({
      data: {
        studentId: student.id,
        placementId: placement.id,
        riskScore: spec.risk.score,
        riskTier: spec.risk.tier,
        topRiskFactors: spec.risk.factors,
        shapValues: {},
        computedAt: new Date(),
      },
    });

    console.log(`✓ ${student.firstName} ${student.lastName} <${spec.email}> — ${spec.weeks.length} weeks, ${spec.risk.tier} risk`);
  }

  console.log('\n✅ Real-student demo wiring complete.');
  console.log('─────────────────────────────────────');
  console.log(`Supervisor login: ${SUPERVISOR_EMAIL} (their own password)`);
  console.log('Students log in with their own registered passwords.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
