import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './visits.controller';

const router = Router();
router.use(authenticate);

// Students read their own reviews; the service scopes the list by role.
router.get('/', asyncHandler(ctrl.listHandler));

// Scheduling is a staff action — a student cannot book their own review.
router.post('/', authorize('academic_supervisor', 'coordinator', 'hod', 'admin'), asyncHandler(ctrl.createHandler));
router.patch('/:id', authorize('academic_supervisor', 'coordinator', 'hod', 'admin'), asyncHandler(ctrl.updateHandler));
router.post('/:id/complete', authorize('academic_supervisor', 'coordinator', 'hod', 'admin'), asyncHandler(ctrl.completeHandler));
router.post('/:id/cancel', authorize('academic_supervisor', 'coordinator', 'hod', 'admin'), asyncHandler(ctrl.cancelHandler));

export default router;
