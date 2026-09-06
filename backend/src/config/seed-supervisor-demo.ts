/**
 * Demo seed — populates the supervisor dashboard for local viewing.
 *
 * Assigns a handful of interns (with scored logbook weeks + risk scores) to the
 * seeded supervisor `supervisor@aesis.cs.edu` so the Pulse Check Board, AI Alerts
 * and Recent Submissions queue render with real data.
 *
 * Idempotent: re-running updates the same interns/placements/weeks in place.
 * Run with:  npx ts-node src/config/seed-supervisor-demo.ts
 */
import { PrismaClient, EntryStatus, RiskTier } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

interface InternSpec {
  first: string;
  last: string;
  email: string;
  programmeCode: string;
  // per-week quality (length = weeks); status derived below
  weeks: { status: EntryStatus; quality: number | null }[];
  risk: { tier: RiskTier; score: number; factors: string[] };
}

// The live week states. `under_review` and `flagged` were legacy submission
// statuses with no equivalent on `logbook_entry`: a week under review is simply
// `submitted`, and a flagged one is `returned`.
const A = EntryStatus.acknowledged;
const S = EntryStatus.submitted;
const R = EntryStatus.returned;
const D = EntryStatus.draft;

const INTERNS: InternSpec[] = [
  {
    first: 'Akosua', last: 'Mensah', email: 'akosua.mensah@student.aesis.cs.edu',
    programmeCode: 'BSC-CS',
    weeks: [
      { status: A, quality: 90 }, { status: A, quality: 93 }, { status: A, quality: 91 },
      { status: A, quality: 95 }, { status: A, quality: 94 }, { status: S, quality: 92 },
    ],
    risk: { tier: RiskTier.low, score: 0.12, factors: ['Consistent submissions', 'High reflection quality'] },
  },
  {
    first: 'Kwabena', last: 'Boateng', email: 'kwabena.boateng@student.aesis.cs.edu',
    programmeCode: 'BSC-SE',
    weeks: [
      { status: A, quality: 78 }, { status: A, quality: 81 }, { status: A, quality: 80 },
      { status: A, quality: 83 }, { status: A, quality: 82 }, { status: S, quality: 82 },
    ],
    risk: { tier: RiskTier.low, score: 0.30, factors: ['Steady engagement', 'On-time submissions'] },
  },
  {
    first: 'Abena', last: 'Owusu', email: 'abena.owusu@student.aesis.cs.edu',
    programmeCode: 'BSC-IT',
    weeks: [
      { status: A, quality: 72 }, { status: A, quality: 74 }, { status: A, quality: 73 },
      { status: A, quality: 76 }, { status: S, quality: 74 }, { status: D, quality: null },
    ],
    risk: { tier: RiskTier.medium, score: 0.55, factors: ['Quality plateauing', 'One missed deadline'] },
  },
  {
    first: 'Yaw', last: 'Asante', email: 'yaw.asante@student.aesis.cs.edu',
    programmeCode: 'BSC-CY',
    weeks: [
      { status: A, quality: 52 }, { status: A, quality: 48 }, { status: R, quality: 41 },
      { status: D, quality: null }, { status: D, quality: null }, { status: D, quality: null },
    ],
    risk: { tier: RiskTier.high, score: 0.82, factors: ['Missed 3 submissions', 'Quality below threshold', 'Engagement dropping 45%'] },
  },
];

async function main() {
  console.log('🌱 Seeding supervisor demo data...');

  const dept = await prisma.department.findUniqueOrThrow({ where: { code: 'CS' } });
  const academicYear = await prisma.academicYear.findFirstOrThrow({ where: { isActive: true } });
  const supervisor = await prisma.user.findUniqueOrThrow({ where: { email: 'supervisor@aesis.cs.edu' } });
  console.log(`✓ Supervisor: ${supervisor.firstName} ${supervisor.lastName} (${supervisor.email})`);

  const programmes = await prisma.academicProgramme.findMany({ where: { departmentId: dept.id } });
  const progByCode = new Map(programmes.map((p) => [p.code, p.id]));

  const company = await prisma.company.upsert({
    where: { name: 'Ananse Technologies Ltd.' },
    update: {},
    create: { name: 'Ananse Technologies Ltd.', industry: 'Software', website: 'https://ananse.example.com' },
  });
  console.log(`✓ Company: ${company.name}`);

  const pwHash = await bcrypt.hash('Student@1234', 12);
  const startDate = new Date('2025-01-13'); // a Monday

  for (const spec of INTERNS) {
    const student = await prisma.user.upsert({
      where: { email: spec.email },
      update: { isVerified: true },
      create: {
        email: spec.email,
        passwordHash: pwHash,
        role: 'student',
        firstName: spec.first,
        lastName: spec.last,
        departmentId: dept.id,
        programmeId: progByCode.get(spec.programmeCode) ?? null,
        isVerified: true,
      },
    });

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

    console.log(`✓ Intern: ${spec.first} ${spec.last} — ${spec.weeks.length} weeks, ${spec.risk.tier} risk`);
  }

  console.log('\n✅ Supervisor demo seed complete.');
  console.log('─────────────────────────────────────');
  console.log('Login:  supervisor@aesis.cs.edu / Super@1234');
  console.log('Interns password (if you log in as one): Student@1234');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
