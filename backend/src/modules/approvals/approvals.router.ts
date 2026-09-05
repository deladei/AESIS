import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './approvals.controller';

const router = Router();
router.use(authenticate);

// The service scopes the queue by role: a student sees their own requests, a
// supervisor sees their students', the coordinator sees the cohort.
router.get('/pending', asyncHandler(ctrl.listPendingHandler));
router.post('/', asyncHandler(ctrl.createHandler));

// Deciding is staff-only; WHICH staff depends on the request's kind and is
// settled in approvals.policy.ts.
router.patch(
  '/:id/decide',
  authorize('academic_supervisor', 'coordinator', 'hod', 'admin'),
  asyncHandler(ctrl.decideHandler),
);

export default router;
