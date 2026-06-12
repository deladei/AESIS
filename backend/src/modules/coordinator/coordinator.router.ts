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

// GET /api/v1/coordinator/activity
router.get('/activity', asyncHandler(ctrl.activity));

// GET /api/v1/coordinator/supervisors
router.get('/supervisors', asyncHandler(ctrl.supervisors));

// GET /api/v1/coordinator/oversight — cross-cohort at-risk monitoring
router.get('/oversight', asyncHandler(ctrl.oversight));

// GET  /api/v1/coordinator/cohort-config — active year's config
// PATCH /api/v1/coordinator/cohort-config — set per-week minimum hours
router.get('/cohort-config', asyncHandler(ctrl.cohortConfig));
router.patch('/cohort-config', asyncHandler(ctrl.updateCohortConfig));

export default router;
