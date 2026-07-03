import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { todayUtc, daysBetween } from '../entries/entry.dates';
import { scoreRisk, type RiskInput, type RiskScore } from './risk.signals';
import type { Actor } from '../entries/entries.policy';

export interface PlacementRisk extends RiskScore {
  placementId: string;
  student: { id: string; name: string };
}

type PlacementForRisk = {
  id: string;
  startDate: Date | null;
  studentId: string;
  academicSupervisorId: string | null;
  student: { id: string; firstName: string; lastName: string };
  logbookEntries: {
    weekNumber: number;
    status: 'draft' | 'submitted' | 'returned' | 'acknowledged';
    submittedAt: Date | null;
    days: { status: 'draft' | 'submitted'; submittedAt: Date | null; loggedLate: boolean }[];
  }[];
};

const placementSelect = {
  id: true,
  startDate: true,
  studentId: true,
  academicSupervisorId: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  logbookEntries: {
    select: {
      weekNumber: true,
      status: true,
      submittedAt: true,
      days: { select: { status: true, submittedAt: true, loggedLate: true } },
    },
  },
} as const;

/** Derive the scorer's inputs from one placement's live entries data. */
export function riskInputsOf(p: PlacementForRisk, now = new Date()): RiskInput | null {
  if (!p.startDate) return null;

  const startUtc = new Date(`${p.startDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const weeksElapsed = Math.floor(daysBetween(startUtc, todayUtc()) / 7);

  const dayLogs = p.logbookEntries.flatMap((e) => e.days).filter((d) => d.status === 'submitted');
  const lastActivityAt = [
    ...p.logbookEntries.map((e) => e.submittedAt),
    ...dayLogs.map((d) => d.submittedAt),
  ]
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    weeksElapsed,
    weeksSubmitted: p.logbookEntries.filter(
      (e) =>
        e.weekNumber <= weeksElapsed &&
        (e.status === 'submitted' || e.status === 'acknowledged'),
    ).length,
    returnedCount: p.logbookEntries.filter((e) => e.status === 'returned').length,
    lateDays: dayLogs.filter((d) => d.loggedLate).length,
    submittedDays: dayLogs.length,
    daysSinceLastActivity: lastActivityAt
      ? Math.max(0, Math.floor((now.getTime() - lastActivityAt.getTime()) / 86_400_000))
      : null,
  };
}

/**
 * Persist a snapshot only when the tier moved (or none exists yet) — the table
 * stays a history of movements, not a log of dashboard loads. Escalation to
 * `high` notifies the academic supervisor (in-app + socket), advisory framing.
 */
async function persistIfTierChanged(p: PlacementForRisk, risk: RiskScore): Promise<void> {
  const latest = await prisma.studentRiskScore.findFirst({
    where: { placementId: p.id },
    orderBy: { computedAt: 'desc' },
    select: { riskTier: true },
  });
  if (latest?.riskTier === risk.tier) return;

  await prisma.studentRiskScore.create({
    data: {
      studentId: p.studentId,
      placementId: p.id,
      riskScore: risk.score,
      riskTier: risk.tier,
      previousTier: latest?.riskTier ?? null,
      topRiskFactors: risk.factors.map((f) => f.label),
      // Rule contributions, stored in the SHAP-era column for continuity.
      shapValues: Object.fromEntries(risk.factors.map((f) => [f.key, f.contribution])),
    },
  });

  if (risk.tier === 'high' && p.academicSupervisorId) {
    const studentName = `${p.student.firstName} ${p.student.lastName}`;
    const notification = await prisma.notification.create({
      data: {
        userId: p.academicSupervisorId,
        type: 'risk_alert',
        title: 'Student flagged high risk',
        body: `${studentName} is showing risk signals: ${risk.factors
          .map((f) => f.label)
          .join('; ')}. Advisory only — worth a check-in.`,
        link: '/feedback',
        metadata: { placementId: p.id, studentId: p.studentId, riskScore: risk.score },
      },
    });
    emitToUser(p.academicSupervisorId, 'notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      createdAt: notification.createdAt,
    });
  }
}

async function computeActivePlacements(supervisorId?: string): Promise<PlacementRisk[]> {
  const placements: PlacementForRisk[] = await prisma.placement.findMany({
    where: {
      placementStatus: 'active',
      ...(supervisorId ? { academicSupervisorId: supervisorId } : {}),
    },
    select: placementSelect,
  });

  const results: PlacementRisk[] = [];
  for (const p of placements) {
    const input = riskInputsOf(p);
    if (!input) continue;
    const risk = scoreRisk(input);
    if (!risk) continue;

    try {
      await persistIfTierChanged(p, risk);
    } catch (err) {
      // Snapshot/notification failure must never break the read path.
      logger.warn('risk: snapshot persist failed', { placementId: p.id, err });
    }

    results.push({
      ...risk,
      placementId: p.id,
      student: { id: p.student.id, name: `${p.student.firstName} ${p.student.lastName}` },
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Live risk overview over every active placement the actor may see:
 * academic_supervisor → assigned interns only; coordinator/admin → cohort-wide.
 * Placements too new to judge (no full week elapsed) are omitted, not scored.
 */
export async function riskOverview(actor: Actor): Promise<PlacementRisk[]> {
  return computeActivePlacements(actor.role === 'academic_supervisor' ? actor.id : undefined);
}

/**
 * Recompute + snapshot without returning anything — dashboards call this before
 * reading `student_risk_scores` so the tiers they render are current. Never
 * throws: a risk failure must not take a dashboard down.
 */
export async function refreshRiskSnapshots(supervisorId?: string): Promise<void> {
  try {
    await computeActivePlacements(supervisorId);
  } catch (err) {
    logger.warn('risk: snapshot refresh failed', { supervisorId, err });
  }
}
