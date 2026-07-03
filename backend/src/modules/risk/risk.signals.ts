import { SYSTEM_MAX_WEEKS } from '../../shared/utils/quality';

/**
 * Rule-based risk scoring over live entries-pipeline data. Deterministic and
 * advisory only — a tier flags a student for a supervisor conversation, it
 * never contributes to a grade. (Replaces the retired Python XGBoost pipeline,
 * which read legacy tables and never ran in production.)
 */

export interface RiskInput {
  /** Whole weeks since the placement started, uncapped (scorer clamps). */
  weeksElapsed: number;
  /** Due weeks (1..weeksElapsed) whose entry is submitted or acknowledged. */
  weeksSubmitted: number;
  /** Entries currently sitting in `returned` — rework the student owes. */
  returnedCount: number;
  /** Submitted day logs stamped loggedLate. */
  lateDays: number;
  /** All submitted day logs. */
  submittedDays: number;
  /** Days since the student last submitted anything (day or week); null = never. */
  daysSinceLastActivity: number | null;
}

export interface RiskFactor {
  key: 'missing_weeks' | 'inactivity' | 'late_logging' | 'rework_outstanding';
  label: string;
  /** This factor's share of the 0–1 score. */
  contribution: number;
}

export type RiskTierValue = 'low' | 'medium' | 'high';

export interface RiskScore {
  /** 0–1, rounded to 3 dp. */
  score: number;
  tier: RiskTierValue;
  factors: RiskFactor[];
}

// Weights sum to 1. Missing weeks dominates: not handing in the logbook is the
// single strongest predictor a placement is drifting.
const W_MISSING = 0.4;
const W_INACTIVITY = 0.3;
const W_LATE = 0.15;
const W_REWORK = 0.15;

// Inactivity saturates at two silent weeks; rework at two returned weeks.
const INACTIVITY_SATURATION_DAYS = 14;
const REWORK_SATURATION = 2;

export const RISK_HIGH_THRESHOLD = 0.6;
export const RISK_MEDIUM_THRESHOLD = 0.3;

// A factor must carry real weight before it's named as a reason.
const FACTOR_FLOOR = 0.05;

function tierOf(score: number): RiskTierValue {
  if (score >= RISK_HIGH_THRESHOLD) return 'high';
  if (score >= RISK_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Score one placement. Returns null when no full week has elapsed yet — a
 * brand-new placement has produced no evidence either way, and scoring it
 * would manufacture an impossible state (the old pipeline's zeroed features
 * flagged every fresh student as high risk).
 */
export function scoreRisk(input: RiskInput): RiskScore | null {
  const weeksDue = Math.min(Math.floor(input.weeksElapsed), SYSTEM_MAX_WEEKS);
  if (weeksDue < 1) return null;

  const missingWeeks = Math.max(0, weeksDue - input.weeksSubmitted);

  // Never submitted anything → silence spans the whole placement so far.
  const idleDays = input.daysSinceLastActivity ?? weeksDue * 7;

  const missing = clamp01(missingWeeks / weeksDue) * W_MISSING;
  const inactivity = clamp01(idleDays / INACTIVITY_SATURATION_DAYS) * W_INACTIVITY;
  const late =
    input.submittedDays > 0
      ? clamp01(input.lateDays / input.submittedDays) * W_LATE
      : 0;
  const rework = clamp01(input.returnedCount / REWORK_SATURATION) * W_REWORK;

  const candidates: RiskFactor[] = [
    {
      key: 'missing_weeks',
      label: `${missingWeeks} of ${weeksDue} due week${weeksDue === 1 ? '' : 's'} not submitted`,
      contribution: missing,
    },
    {
      key: 'inactivity',
      label: `No logbook activity for ${idleDays} day${idleDays === 1 ? '' : 's'}`,
      contribution: inactivity,
    },
    {
      key: 'late_logging',
      label: `${input.lateDays} of ${input.submittedDays} day log${input.submittedDays === 1 ? '' : 's'} submitted late`,
      contribution: late,
    },
    {
      key: 'rework_outstanding',
      label: `${input.returnedCount} returned week${input.returnedCount === 1 ? '' : 's'} awaiting rework`,
      contribution: rework,
    },
  ];

  const score = Math.round((missing + inactivity + late + rework) * 1000) / 1000;
  const factors = candidates
    .filter((f) => f.contribution >= FACTOR_FLOOR)
    .sort((a, b) => b.contribution - a.contribution);

  return { score, tier: tierOf(score), factors };
}
