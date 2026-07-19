import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { authorize } from '../../middleware/authorize';
import {
  createSupervisorHandler,
  listSupervisorsHandler,
  listAssessmentsHandler,
  paperAssessmentHandler,
  listWeeklyCommentsHandler,
  paperWeeklyCommentHandler,
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

// FORMATIVE weekly comments: the student reads these, so the read is scoped by
// the placement policy in the service (own / assigned / staff), not staff-only.
router.get('/:id/weekly-comments', asyncHandler(listWeeklyCommentsHandler));
router.post(
  '/:id/weekly-comments/paper',
  authorize('coordinator', 'hod', 'admin'),
  asyncHandler(paperWeeklyCommentHandler),
);

export default router;
