#!/usr/bin/env node
/**
 * Mirrors the canonical validation schemas from the API into the SPA.
 *
 * They are authored ONCE, in backend/src/shared/validation. The SPA cannot
 * simply import them across the repo: Vercel's Root Directory is `frontend/`,
 * so nothing above it exists in the build context — the import resolves locally
 * and fails in production.
 *
 * So the files are mirrored into frontend/src/shared/validation and committed.
 * Every copy carries a GENERATED banner, `npm run sync:shared` refreshes them,
 * and `--check` (run by the backend's drift test and CI) fails if a copy has
 * gone stale. Edit the backend original; never the copy.
 *
 * On Vercel the source directory is absent — the script exits quietly and the
 * committed mirror is used as-is.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../backend/src/shared/validation');
const OUT = resolve(here, '../src/shared/validation');
const REGIONS_SRC = resolve(here, '../../backend/src/shared/constants/regions.ts');
const REGIONS_OUT = resolve(here, '../src/shared/constants/regions.ts');

const BANNER = `// GENERATED FILE — DO NOT EDIT.
// Mirrored from backend/src/shared/validation by frontend/scripts/sync-shared.mjs.
// Edit the backend original and run \`npm run sync:shared\` in frontend/.
`;

const check = process.argv.includes('--check');

if (!existsSync(SRC)) {
  if (check) {
    console.error('sync-shared: backend sources not found — cannot verify the mirror.');
    process.exit(1);
  }
  // Vercel builds from frontend/ alone; the committed mirror is what ships.
  console.log('sync-shared: backend sources not present, using the committed mirror.');
  process.exit(0);
}

const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
let stale = [];

function mirror(fromPath, toPath, rewrite = (s) => s) {
  const body = BANNER + rewrite(readFileSync(fromPath, 'utf8'));
  mkdirSync(dirname(toPath), { recursive: true });
  const current = existsSync(toPath) ? readFileSync(toPath, 'utf8') : null;
  if (current === body) return;
  if (check) { stale.push(toPath); return; }
  writeFileSync(toPath, body);
  console.log(`sync-shared: wrote ${toPath}`);
}

for (const f of files) {
  mirror(join(SRC, f), join(OUT, f), (s) =>
    // The backend reaches up to shared/constants; the mirror keeps that shape.
    s.replaceAll("from '../constants/regions'", "from '../constants/regions'"));
}
mirror(REGIONS_SRC, REGIONS_OUT);

if (check && stale.length > 0) {
  console.error(
    'sync-shared: the mirrored validation schemas are stale:\n' +
    stale.map((f) => `  ${f}`).join('\n') +
    '\nRun `npm run sync:shared` in frontend/ and commit the result.',
  );
  process.exit(1);
}
if (check) console.log('sync-shared: mirror is up to date.');
