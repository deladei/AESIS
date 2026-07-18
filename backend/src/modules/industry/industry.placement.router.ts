import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { authorize } from '../../middleware/authorize';
import {
  createSupervisorHandler,
  listSupervisorsHandler,
  listAssessmentsHandler,
  paperAssessmentHandler,
} from './industry.controller';

// Per-placement industry supervisor records. Mounted under /placements;
// per-action role rules live in industry.service.
const router = Router();
router.use(authenticate);

router.get('/:id/industry-supervisors', asyncHandler(listSupervisorsHandler));
router.post('/:id/industry-supervisors', asyncHandler(createSupervisorHandler));

// CONFIDENTIAL industry assessment: staff-only, route-level AND service-level.
// No student or supervisor route exists at all — absence is the mechanism.
router.get(
  '/:id/industry-assessment',
  authorize('coordinator', 'admin'),
  asyncHandler(listAssessmentsHandler),
);
router.post(
  '/:id/industry-assessment/paper',
  authorize('coordinator', 'admin'),
  asyncHandler(paperAssessmentHandler),
);

export default router;
