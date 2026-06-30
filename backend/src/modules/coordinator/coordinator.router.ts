import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './coordinator.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('coordinator', 'admin'));

// GET /api/v1/coordinator/dashboard
router.get('/dashboard', asyncHandler(ctrl.dashboard));

// GET /api/v1/coordinator/students
router.get('/students', asyncHandler(ctrl.students));

// Bulk actions + CSV export. NOTE: these static paths must be registered
// BEFORE the '/students/:placementId' param route so they aren't swallowed.
router.get('/students/export.csv', asyncHandler(ctrl.exportCsv));
router.post('/students/bulk/reminder', asyncHandler(ctrl.bulkReminder));
router.post('/students/bulk/assign', asyncHandler(ctrl.bulkAssign));

// GET /api/v1/coordinator/students/:placementId — full intern profile
router.get('/students/:placementId', asyncHandler(ctrl.studentDetail));

// POST /api/v1/coordinator/students/:placementId/message — message the intern
router.post('/students/:placementId/message', asyncHandler(ctrl.messageStudent));

// POST /api/v1/coordinator/students/:placementId/reminder — nudge the intern
router.post('/students/:placementId/reminder', asyncHandler(ctrl.remindStudent));

// POST /api/v1/coordinator/students/:placementId/flag — flag/un-flag for attention
router.post('/students/:placementId/flag', asyncHandler(ctrl.setFlag));

// GET /api/v1/coordinator/activity
router.get('/activity', asyncHandler(ctrl.activity));

// GET /api/v1/coordinator/supervisors
router.get('/supervisors', asyncHandler(ctrl.supervisors));

// POST /api/v1/coordinator/supervisors/bulk — upload a supervisor roster (name/email/region)
router.post('/supervisors/bulk', asyncHandler(ctrl.bulkCreateSupervisors));

// PATCH /api/v1/coordinator/supervisors/:id/region — set region a supervisor covers
router.patch('/supervisors/:id/region', asyncHandler(ctrl.setSupervisorRegion));

// GET /api/v1/coordinator/unassigned-placements — interns whose region had no supervisor yet
router.get('/unassigned-placements', asyncHandler(ctrl.unassignedPlacements));

// GET /api/v1/coordinator/search?q= — global typeahead (interns + companies, item 18)
router.get('/search', asyncHandler(ctrl.search));

// GET /api/v1/coordinator/feature-flags — shell nav gating (item 24)
router.get('/feature-flags', asyncHandler(ctrl.featureFlags));

// GET /api/v1/coordinator/programmes — department filter options
router.get('/programmes', asyncHandler(ctrl.programmes));

// GET /api/v1/coordinator/cohorts — academic-year filter options
router.get('/cohorts', asyncHandler(ctrl.cohorts));

// GET /api/v1/coordinator/oversight — cross-cohort at-risk monitoring
router.get('/oversight', asyncHandler(ctrl.oversight));

// GET /api/v1/coordinator/supervisor-workload — interns-per-supervisor + imbalance (item 14)
router.get('/supervisor-workload', asyncHandler(ctrl.supervisorWorkload));

// GET /api/v1/coordinator/performance-distribution — quality-score spread + below-threshold (item 15)
router.get('/performance-distribution', asyncHandler(ctrl.performanceDistribution));

// GET  /api/v1/coordinator/cohort-config — active year's config
// PATCH /api/v1/coordinator/cohort-config — set per-week minimum hours
router.get('/cohort-config', asyncHandler(ctrl.cohortConfig));
router.patch('/cohort-config', asyncHandler(ctrl.updateCohortConfig));

export default router;
