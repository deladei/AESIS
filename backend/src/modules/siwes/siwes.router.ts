import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './siwes.controller';

const router = Router();

// All SIWES logbook routes require authentication. Per-placement scope is
// decided in the service via entries.policy (the single decision point) —
// router-level authorize() only pre-filters by role.
router.use(authenticate);

// ── Student authoring ─────────────────────────────────────────
// Upsert one day of the daily logbook (create, or edit within the window).
router.put(
  '/days',
  authorize('student', 'admin'),
  asyncHandler(ctrl.saveDailyEntryHandler),
);

// Upsert the trainee's weekly report.
router.put(
  '/weeks/summary',
  authorize('student', 'admin'),
  asyncHandler(ctrl.saveWeeklySummaryHandler),
);

// ── Absences ──────────────────────────────────────────────────
// Students self-report sick/permitted; staff record any kind (service gates).
router.post(
  '/absences',
  authorize('student', 'academic_supervisor', 'coordinator', 'hod', 'admin'),
  asyncHandler(ctrl.recordAbsenceHandler),
);

// ── Chain-aware calendar (day classification + missing flags) ─
router.get(
  '/placements/:placementId/calendar',
  asyncHandler(ctrl.getLogbookCalendarHandler),
);

// ── Cohort holiday calendar (configuration, not evidence) ─────
router.get('/non-working-days', asyncHandler(ctrl.listNonWorkingDaysHandler));

router.post(
  '/non-working-days',
  authorize('coordinator', 'hod', 'admin'),
  asyncHandler(ctrl.createNonWorkingDayHandler),
);

router.delete(
  '/non-working-days/:id',
  authorize('coordinator', 'hod', 'admin'),
  asyncHandler(ctrl.deleteNonWorkingDayHandler),
);

export default router;
