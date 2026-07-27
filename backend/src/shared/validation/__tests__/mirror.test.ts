import fs from 'fs';
import path from 'path';

/**
 * The SPA cannot import these schemas across the repo: Vercel's Root Directory
 * is `frontend/`, so nothing above it exists in the build context — an import
 * across the repo resolves locally and fails in production (it did, once).
 *
 * So frontend/src/shared/validation holds a generated mirror, refreshed by
 * `npm run sync:shared`. This test is what stops the two from drifting: edit the
 * original here, forget the mirror, and it fails.
 */

const ORIGIN = path.join(__dirname, '..');
const MIRROR = path.join(__dirname, '../../../../../frontend/src/shared/validation');

const BANNER_LINES = 3; // GENERATED banner prepended by the sync script

const mirrorExists = fs.existsSync(MIRROR);
const describeIfMirror = mirrorExists ? describe : describe.skip;

describeIfMirror('shared validation mirror', () => {
  const originals = fs.readdirSync(ORIGIN).filter((f) => f.endsWith('.ts'));

  it.each(originals)('frontend copy of %s is current', (file) => {
    const mirrored = path.join(MIRROR, file);
    expect(fs.existsSync(mirrored)).toBe(true);

    const source = fs.readFileSync(path.join(ORIGIN, file), 'utf8');
    const copy = fs.readFileSync(mirrored, 'utf8').split('\n').slice(BANNER_LINES).join('\n');

    // Message names the fix so a failure is self-service.
    expect(copy === source ? 'in sync' : `stale: run \`npm run sync:shared\` in frontend/ (${file})`)
      .toBe('in sync');
  });

  it('every copy is marked generated so nobody edits it by hand', () => {
    for (const file of fs.readdirSync(MIRROR).filter((f) => f.endsWith('.ts'))) {
      const head = fs.readFileSync(path.join(MIRROR, file), 'utf8').slice(0, 200);
      expect(head).toContain('GENERATED FILE — DO NOT EDIT');
    }
  });
});
