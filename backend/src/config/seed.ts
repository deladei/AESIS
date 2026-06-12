import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding AESIS database...');

  // ── CS Department ─────────────────────────────────────────────
  const dept = await prisma.department.upsert({
    where: { code: 'CS' },
    update: {},
    create: { name: 'Computer Science', code: 'CS' },
  });
  console.log(`✓ Department: ${dept.name}`);

  // ── Programmes ────────────────────────────────────────────────
  const programmes = await Promise.all([
    prisma.academicProgramme.upsert({
      where: { code: 'BSC-CS' },
      update: {},
      create: { name: 'B.Sc. Computer Science', code: 'BSC-CS', departmentId: dept.id },
    }),
    prisma.academicProgramme.upsert({
      where: { code: 'BSC-SE' },
      update: {},
      create: { name: 'B.Sc. Software Engineering', code: 'BSC-SE', departmentId: dept.id },
    }),
    prisma.academicProgramme.upsert({
      where: { code: 'BSC-IT' },
      update: {},
      create: { name: 'B.Sc. Information Technology', code: 'BSC-IT', departmentId: dept.id },
    }),
    prisma.academicProgramme.upsert({
      where: { code: 'BSC-CY' },
      update: {},
      create: { name: 'B.Sc. Cybersecurity', code: 'BSC-CY', departmentId: dept.id },
    }),
    prisma.academicProgramme.upsert({
      where: { code: 'BSC-DS' },
      update: {},
      create: { name: 'B.Sc. Data Science', code: 'BSC-DS', departmentId: dept.id },
    }),
  ]);
  console.log(`✓ Programmes: ${programmes.length} created`);

  // ── Prune orphan programmes from older seeds (only if unreferenced) ──
  const canonicalCodes = programmes.map((p) => p.code);
  const orphans = await prisma.academicProgramme.findMany({
    where: { code: { notIn: canonicalCodes }, users: { none: {} } },
    select: { id: true, code: true },
  });
  if (orphans.length) {
    await prisma.academicProgramme.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    console.log(`✓ Pruned ${orphans.length} orphan programme(s): ${orphans.map((o) => o.code).join(', ')}`);
  }

  // ── Academic Year ─────────────────────────────────────────────
  const academicYear = await prisma.academicYear.upsert({
    where: { label: '2024/2025' },
    update: { isActive: true },
    create: {
      label:     '2024/2025',
      startDate: new Date('2024-09-01'),
      endDate:   new Date('2025-08-31'),
      isActive:  true,
    },
  });

  await prisma.cohortConfig.upsert({
    where: { academicYearId: academicYear.id },
    update: {},
    create: {
      academicYearId:          academicYear.id,
      submissionDeadlineDay:   5,
      submissionDeadlineHour:  23,
      submissionDeadlineMinute:59,
      reminderDayOfWeek:       1,
      reminderHour:            8,
      totalWeeks:              6,
    },
  });
  console.log(`✓ Academic year: ${academicYear.label}`);

  // ── Admin account ─────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@aesis.cs.edu' },
    update: { passwordHash, isVerified: true },
    create: {
      email:        'admin@aesis.cs.edu',
      passwordHash,
      role:         'admin',
      firstName:    'System',
      lastName:     'Admin',
      departmentId: dept.id,
      isVerified:   true,
    },
  });
  console.log(`✓ Admin: ${admin.email}`);

  // ── Coordinator account ───────────────────────────────────────
  const coordHash = await bcrypt.hash('Coord@1234', 12);
  const coordinator = await prisma.user.upsert({
    where: { email: 'coordinator@aesis.cs.edu' },
    update: { passwordHash: coordHash, isVerified: true },
    create: {
      email:        'coordinator@aesis.cs.edu',
      passwordHash: coordHash,
      role:         'coordinator',
      firstName:    'CS Programme',
      lastName:     'Coordinator',
      departmentId: dept.id,
      isVerified:   true,
    },
  });
  console.log(`✓ Coordinator: ${coordinator.email}`);

  // ── Sample supervisor ─────────────────────────────────────────
  const superHash = await bcrypt.hash('Super@1234', 12);
  await prisma.user.upsert({
    where: { email: 'supervisor@aesis.cs.edu' },
    update: { passwordHash: superHash, isVerified: true, firstName: 'Dr. Kofi', lastName: 'Adjei' },
    create: {
      email:        'supervisor@aesis.cs.edu',
      passwordHash: superHash,
      role:         'academic_supervisor',
      firstName:    'Dr. Kofi',
      lastName:     'Adjei',
      departmentId: dept.id,
      isVerified:   true,
    },
  });
  console.log(`✓ Supervisor: supervisor@aesis.cs.edu`);

  console.log('\n✅ Seed complete.');
  console.log('─────────────────────────────────────');
  console.log('Admin:       admin@aesis.cs.edu       / Admin@1234');
  console.log('Coordinator: coordinator@aesis.cs.edu  / Coord@1234');
  console.log('Supervisor:  supervisor@aesis.cs.edu   / Super@1234');
}

seed()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
