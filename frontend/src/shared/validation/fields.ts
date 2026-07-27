// GENERATED FILE — DO NOT EDIT.
// Mirrored from backend/src/shared/validation by frontend/scripts/sync-shared.mjs.
// Edit the backend original and run `npm run sync:shared` in frontend/.
import { z } from 'zod';

/**
 * Field-level validation primitives — the ONE definition of every rule, shared
 * verbatim by the API and the SPA (the frontend aliases this folder as
 * `@shared/validation`; see frontend/vite.config.ts).
 *
 * It lives under backend/src because the backend compiles with `rootDir: ./src`
 * and starts as `node dist/server.js`; a repo-root folder would shift the dist
 * layout and break the Render start command. The bundler has no such
 * constraint, so the frontend reaches in rather than the other way round.
 *
 * Nothing here may import anything but zod — it is bundled into the browser.
 *
 * Client-side use is UX. The server re-parses every payload; that is the
 * guarantee.
 */

// ── Names ───────────────────────────────────────────────────────
// Deliberately NOT /^[A-Za-z]+$/. Ghanaian and international names carry
// spaces, hyphens and apostrophes (Nana Ama, Owusu-Ansah, N'Guessan) and
// accented letters (Améyaw, Bénédicte). \p{L} covers every script's letters and
// \p{M} the combining marks that build accented glyphs; digits and symbols are
// still rejected. Must start with a letter, so " -x" and "'" fail.
const NAME_BODY = "[\\p{L}\\p{M}][\\p{L}\\p{M} '’.-]*";
export const NAME_PATTERN = new RegExp(`^${NAME_BODY}$`, 'u');

export const personName = (label = 'Name', max = 50) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(max, `${label} must be ${max} characters or fewer`)
    .regex(NAME_PATTERN, `${label} may only contain letters, spaces, hyphens and apostrophes`);

/** Company / institution names — same idea, but digits are legitimate ("Hubtel 2 Ltd"). */
export const organisationName = (label = 'Name') =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(200, `${label} must be 200 characters or fewer`)
    .regex(
      /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’.,&()/-]*$/u,
      `${label} contains characters that are not allowed`,
    );

// ── Email ───────────────────────────────────────────────────────
export const email = (label = 'Email') =>
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email(`Enter a valid ${label.toLowerCase()} address`));

// ── Phone (Ghana) ───────────────────────────────────────────────
// Accepts 0XXXXXXXXX and +233XXXXXXXXX (and 233XXXXXXXXX, which people paste
// out of WhatsApp), tolerating spaces/dashes as typed. Stored in one form:
// +233XXXXXXXXX. The national number after the 0 / +233 is 9 digits.
const PHONE_STRIP = /[\s()-]/g;

export function normaliseGhanaPhone(raw: string): string | null {
  const s = raw.replace(PHONE_STRIP, '');
  const national =
    /^0(\d{9})$/.exec(s)?.[1] ??
    /^\+233(\d{9})$/.exec(s)?.[1] ??
    /^233(\d{9})$/.exec(s)?.[1] ??
    null;
  return national ? `+233${national}` : null;
}

export const ghanaPhone = (label = 'Phone number') =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const normalised = normaliseGhanaPhone(v);
      if (!normalised) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a Ghanaian number — 0XXXXXXXXX or +233XXXXXXXXX`,
        });
        return z.NEVER;
      }
      return normalised;
    });

// ── Identifiers ─────────────────────────────────────────────────
export const indexNumber = z
  .string()
  .trim()
  .min(3, 'Index number is too short')
  .max(40, 'Index number is too long')
  .regex(/^[\p{L}\p{N}/-]+$/u, 'Index number may only contain letters, digits, slashes and hyphens');

export const staffId = z
  .string()
  .trim()
  .min(3, 'Staff ID is too short')
  .max(30, 'Staff ID is too long')
  .regex(/^[\p{L}\p{N}/-]+$/u, 'Staff ID may only contain letters, digits, slashes and hyphens');

// ── Free text ───────────────────────────────────────────────────
/** Required free text: trimmed, non-empty after trimming, bounded. */
export const freeText = (max: number, label = 'This field') =>
  z
    .string()
    .trim()
    .min(1, `${label} cannot be empty`)
    .max(max, `${label} must be ${max.toLocaleString()} characters or fewer`);

/** Optional free text: absent or empty collapses to undefined rather than ''. */
export const optionalFreeText = (max: number, label = 'This field') =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max.toLocaleString()} characters or fewer`)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

// ── Numbers ─────────────────────────────────────────────────────
/**
 * Week numbers are bounded by the cohort's configured attachment length
 * (`CohortConfig.durationWeeks`) — never a literal. Before this, entries capped
 * the week at 6 and SIWES at 52 while cohorts could be configured to 24, so a
 * 24-week cohort could not save week 7.
 */
export const weekNumber = (durationWeeks: number, label = 'Week number') =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(1, `${label} must be at least 1`)
    .max(durationWeeks, `${label} must be ${durationWeeks} or lower for this cohort`);

/**
 * Schema-level sanity ceiling for request bodies parsed BEFORE the cohort is
 * loaded. The real bound is the cohort's span and is enforced in the service
 * (see `assertWeekWithinAttachment`) — this only stops absurd input reaching a
 * DB lookup. Never use it as the actual rule.
 */
export const WEEK_NUMBER_CEILING = 52;

export const weekNumberCeiling = (label = 'Week number') =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(1, `${label} must be at least 1`)
    .max(WEEK_NUMBER_CEILING, `${label} must be ${WEEK_NUMBER_CEILING} or lower`);

/** Hours worked in a single day. */
export const dayHours = z
  .number({ invalid_type_error: 'Hours must be a number' })
  .min(0, 'Hours cannot be negative')
  .max(24, 'A day cannot exceed 24 hours');

/** Hours worked across a week. */
export const weekHours = z
  .number({ invalid_type_error: 'Hours must be a number' })
  .min(0, 'Hours cannot be negative')
  .max(168, 'A week cannot exceed 168 hours');

/** A whole number within an inclusive range — config fields, counts, weights. */
export const boundedInt = (min: number, max: number, label = 'Value') =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} cannot exceed ${max}`);

/** A score out of `max`, defaulting to a percentage. */
export const score = (max = 100, label = 'Score') =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} cannot exceed ${max}`);

/**
 * Industrial Attachment Performance Evaluation maxima. These MIRROR database
 * CHECK constraints (20260718130000_assessment_industry) — if one side changes
 * the other must change in the same migration, or writes fail at the DB with a
 * 500 instead of a field-level 422.
 */
export const ASSESSMENT_INDUSTRY_MAXIMA = {
  attendance: 20,
  understanding: 20,
  aptitude: 15,
  punctuality: 15,
  autonomy: 10,
  cooperation: 10,
  safety: 10,
} as const;

export const ASSESSMENT_INDUSTRY_TOTAL = 100;
