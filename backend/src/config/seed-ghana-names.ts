/**
 * Ghanaian-ise the demo data.
 *
 * AESIS is deployed in Ghana, so every demo/seed/placeholder name has to be
 * Ghanaian. The local database still carried names from an early seed that no
 * longer exists in any file — Sarah Jenkins, Alex Kim, Elena Kostas, David
 * Rivera, "Nimbus Technologies Ltd." — and they showed up in every screenshot.
 *
 * This RENAMES rather than reseeds: the placements, logbook entries, risk
 * scores and audit rows hanging off these ids are the only realistic data on
 * the box, and wiping them would leave every dashboard empty.
 *
 * Idempotent — matches on the old value, so a second run is a no-op. Safe to
 * re-run after any future seed reintroduces one of these.
 *
 * Run with:  npx ts-node src/config/seed-ghana-names.ts
 *
 * LOCAL/DEMO ONLY. It refuses to run against a non-local database.
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

/** Old email → the Ghanaian identity that replaces it. */
interface Rename {
  email: string;
  firstName: string;
  lastName: string;
  /** New login address, when the old one embedded the old name. */
  newEmail?: string;
}

const PEOPLE: Rename[] = [
  // Students carried over from the retired seed.
  { email: 'sarah.jenkins@student.aesis.cs.edu', firstName: 'Adwoa',  lastName: 'Frimpong', newEmail: 'adwoa.frimpong@student.aesis.cs.edu' },
  { email: 'alex.kim@student.aesis.cs.edu',      firstName: 'Yaw',    lastName: 'Agyemang', newEmail: 'yaw.agyemang@student.aesis.cs.edu' },
  { email: 'elena.kostas@student.aesis.cs.edu',  firstName: 'Esi',    lastName: 'Nkrumah',  newEmail: 'esi.nkrumah@student.aesis.cs.edu' },
  { email: 'david.rivera@student.aesis.cs.edu',  firstName: 'Kwabena', lastName: 'Danso',   newEmail: 'kwabena.danso@student.aesis.cs.edu' },

  // The seeded academic supervisor was Nigerian, not Ghanaian.
  { email: 'supervisor@aesis.cs.edu', firstName: 'Dr. Kwesi', lastName: 'Appiah' },

  // Generic fixtures. Emails are left alone — they are the documented
  // role-probe logins — but their display names appear in the UI.
  { email: 'walker@example.com',    firstName: 'Nii Armah', lastName: 'Tetteh' },
  { email: 'test@example.com',      firstName: 'Afia',      lastName: 'Ofori' },
  { email: 'role.student@aesis.dev', firstName: 'Kojo',     lastName: 'Amankwah' },
  { email: 'role.faculty@aesis.dev', firstName: 'Dr. Akua', lastName: 'Sarpong' },
  { email: 'role.company@aesis.dev', firstName: 'Kwaku',    lastName: 'Bediako' },
];

/** Old company name → Ghanaian host company (names taken from the mockups). */
const COMPANIES: { from: string; to: string; industry?: string }[] = [
  { from: 'Nimbus Technologies Ltd.', to: 'Ananse Technologies Ltd.', industry: 'Software' },
  { from: 'TechBridge Ltd',           to: 'Zeal Systems Ltd.',        industry: 'Software' },
];

function assertLocal(url: string | undefined): void {
  if (!url) throw new Error('DATABASE_URL is not set');
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at ${host}, not a local database. ` +
      'This script rewrites demo identities and must never touch production.',
    );
  }
}

async function main() {
  assertLocal(process.env.DATABASE_URL);
  console.log('Ghanaian-ising demo data…\n');

  let renamed = 0;
  for (const p of PEOPLE) {
    const user = await prisma.user.findUnique({
      where: { email: p.email },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!user) { console.log(`  – skip  ${p.email} (no such user)`); continue; }

    const was = `${user.firstName} ${user.lastName}`;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: p.firstName,
        lastName:  p.lastName,
        ...(p.newEmail ? { email: p.newEmail } : {}),
      },
    });
    renamed++;
    console.log(`  ✓ ${was} → ${p.firstName} ${p.lastName}${p.newEmail ? `  (${p.newEmail})` : ''}`);
  }

  let companies = 0;
  for (const c of COMPANIES) {
    const existing = await prisma.company.findFirst({ where: { name: c.from }, select: { id: true } });
    if (!existing) { console.log(`  – skip  ${c.from} (no such company)`); continue; }
    await prisma.company.update({
      where: { id: existing.id },
      data: { name: c.to, ...(c.industry ? { industry: c.industry } : {}) },
    });
    companies++;
    console.log(`  ✓ ${c.from} → ${c.to}`);
  }

  console.log(`\n✅ ${renamed} people, ${companies} companies renamed.`);
  console.log('Passwords are unchanged. Logins whose address moved:');
  for (const p of PEOPLE.filter((x) => x.newEmail)) {
    console.log(`   ${p.newEmail}`);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
