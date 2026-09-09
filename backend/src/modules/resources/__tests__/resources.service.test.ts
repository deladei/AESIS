/**
 * DB-integration tests for the resource shelf. What matters here is who a card
 * reaches: audience is a role array on the row and publication is a flag, and
 * both are enforced in a Prisma `where` — a mock of that proves nothing. Runs
 * against the dedicated local test database, skipping if it is unreachable.
 */
import dotenv from 'dotenv';

dotenv.config();
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://u:p@127.0.0.1:5432/x');
base.hostname = '127.0.0.1';
base.pathname = '/aesis_logbook_test';
process.env.DATABASE_URL = base.toString();

// The upload path streams to Cloudinary; the test has no credentials and no
// business talking to it. Stub the transport only — the row it writes is the
// thing under test.
jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => true),
  uploadBuffer: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/raw/upload/aesis/resources/handbook.pdf',
    publicId: 'aesis/resources/handbook',
    bytes: 2048,
  }),
}));

import { prisma } from '../../../config/prisma';
import { isCloudinaryConfigured } from '../../../config/cloudinary';
import { AppError } from '../../../middleware/errorHandler';
import {
  listResources,
  listManagedResources,
  createResource,
  uploadResource,
  setResourcePublished,
  archiveResource,
  type Actor,
} from '../resources.service';

jest.setTimeout(60_000);

let admin: Actor;
let student: Actor;
let supervisor: Actor;
let deptId: string;
let dbAvailable = true;

async function reachable(): Promise<boolean> {
  try { await prisma.$queryRaw`SELECT 1`; return true; } catch { return false; }
}

async function mkUser(role: string, tag: string): Promise<Actor> {
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

beforeAll(async () => {
  dbAvailable = await reachable();
  if (!dbAvailable) return;

  await prisma.$executeRawUnsafe(
    'TRUNCATE resource, users, departments RESTART IDENTITY CASCADE',
  );
  const dept = await prisma.department.create({ data: { name: 'Computer Science', code: 'CS' } });
  deptId = dept.id;

  admin = await mkUser('admin', 'admin');
  student = await mkUser('student', 'stud');
  supervisor = await mkUser('academic_supervisor', 'sup');
});

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

const itdb = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) { console.warn(`[skip] ${name} — test DB unreachable`); return; }
    await fn();
  });

const notice = {
  title: 'Logbook writing guidelines',
  body: 'Write the day up the day you work it. Name the tools you used.',
  category: 'guideline' as const,
  audienceRoles: ['student' as const],
  sortOrder: 0,
  isPublished: true,
};

describe('the resource shelf', () => {
  itdb('publishes written guidance with no file and no link', async () => {
    // The column exists so a coordinator can post a notice. Before it, a
    // resource had to point somewhere, so guidance had to be smuggled into a
    // title or hosted elsewhere.
    const created = await createResource(admin, notice);
    expect(created.body).toBe(notice.body);
    expect(created.fileUrl).toBeNull();
    expect(created.externalUrl).toBeNull();

    const shelf = await listResources(student);
    expect(shelf.map((r) => r.title)).toContain(notice.title);
  });

  itdb('keeps a card off the shelf of a role it is not addressed to', async () => {
    await createResource(admin, {
      ...notice, title: 'Supervisor marking rubric', audienceRoles: ['academic_supervisor'],
    });

    expect((await listResources(student)).map((r) => r.title))
      .not.toContain('Supervisor marking rubric');
    expect((await listResources(supervisor)).map((r) => r.title))
      .toContain('Supervisor marking rubric');
  });

  itdb('shows the curator what they published to somebody else', async () => {
    // listResources filters to the reader's own role, so an admin posting to
    // students could otherwise never see — or withdraw — their own card.
    const managed = await listManagedResources();
    expect(managed.map((r) => r.title)).toContain(notice.title);
    expect(managed[0].audienceRoles).toBeDefined();
  });

  itdb('stores an uploaded document against the row that offers it', async () => {
    const created = await uploadResource(
      admin,
      { ...notice, title: 'Placement handbook', category: 'policy' },
      {
        buffer: Buffer.from('%PDF-1.4'),
        originalName: 'handbook.pdf',
        size: 2048,
        mimeType: 'application/pdf',
      },
    );

    expect(created.fileUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(created.mimeType).toBe('application/pdf');
    expect(created.fileSize).toBe(2048);
    expect((await listResources(student)).map((r) => r.title)).toContain('Placement handbook');
  });

  itdb('says so plainly when the file store is not configured', async () => {
    // Unconfigured, this used to throw a generic error and reach the browser as
    // "something went wrong" — with a link and written guidance both still
    // working, that named the wrong problem.
    (isCloudinaryConfigured as jest.Mock).mockReturnValueOnce(false);

    await expect(uploadResource(
      admin,
      { ...notice, title: 'Unstorable handbook' },
      { buffer: Buffer.from('x'), originalName: 'a.pdf', size: 1, mimeType: 'application/pdf' },
    )).rejects.toMatchObject({ statusCode: 503 });

    expect((await listManagedResources()).map((r) => r.title)).not.toContain('Unstorable handbook');
  });

  itdb('hiding a card takes it off the reader\'s shelf but keeps it curatable', async () => {
    const created = await createResource(admin, { ...notice, title: 'Draft notice' });
    await setResourcePublished(admin, created.id, false);

    expect((await listResources(student)).map((r) => r.title)).not.toContain('Draft notice');
    expect((await listManagedResources()).map((r) => r.title)).toContain('Draft notice');

    await setResourcePublished(admin, created.id, true);
    expect((await listResources(student)).map((r) => r.title)).toContain('Draft notice');
  });

  itdb('archiving retires a card from both lists without deleting it', async () => {
    const created = await createResource(admin, { ...notice, title: 'Retired guidance' });
    await archiveResource(admin, created.id);

    expect((await listResources(student)).map((r) => r.title)).not.toContain('Retired guidance');
    expect((await listManagedResources()).map((r) => r.title)).not.toContain('Retired guidance');
    // Still on the row — a link someone saved must not 404.
    expect(await prisma.resource.findUnique({ where: { id: created.id } })).not.toBeNull();

    await expect(setResourcePublished(admin, created.id, true)).rejects.toBeInstanceOf(AppError);
  });

  itdb('rejects a publish toggle on a resource that does not exist', async () => {
    await expect(
      setResourcePublished(admin, '00000000-0000-0000-0000-000000000000', true),
    ).rejects.toBeInstanceOf(AppError);
  });
});
