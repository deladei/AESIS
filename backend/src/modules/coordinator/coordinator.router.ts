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

// GET /api/v1/coordinator/students/:placementId — full intern profile
router.get('/students/:placementId', asyncHandler(ctrl.studentDetail));

// POST /api/v1/coordinator/students/:placementId/message — message the intern
router.post('/students/:placementId/message', asyncHandler(ctrl.messageStudent));

// POST /api/v1/coordinator/students/:placementId/reminder — nudge the intern
router.post('/students/:placementId/reminder', asyncHandler(ctrl.remindStudent));

// GET /api/v1/coordinator/activity
router.get('/activity', asyncHandler(ctrl.activity));

// GET /api/v1/coordinator/supervisors
router.get('/supervisors', asyncHandler(ctrl.supervisors));

// GET /api/v1/coordinator/programmes — department filter options
router.get('/programmes', asyncHandler(ctrl.programmes));

// GET /api/v1/coordinator/cohorts — academic-year filter options
router.get('/cohorts', asyncHandler(ctrl.cohorts));

// GET /api/v1/coordinator/oversight — cross-cohort at-risk monitoring
router.get('/oversight', asyncHandler(ctrl.oversight));

// GET  /api/v1/coordinator/cohort-config — active year's config
// PATCH /api/v1/coordinator/cohort-config — set per-week minimum hours
router.get('/cohort-config', asyncHandler(ctrl.cohortConfig));
router.patch('/cohort-config', asyncHandler(ctrl.updateCohortConfig));

export default router;
