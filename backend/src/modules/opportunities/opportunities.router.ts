import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './opportunities.controller';

const router = Router();
router.use(authenticate);

// Browsing: students see published postings only (scoped in the service).
router.get('/', asyncHandler(ctrl.listHandler));

// Posting is the coordinator's job. Employer self-service would need an
// employer identity + verification flow that does not exist in this system.
router.post('/', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.createHandler));
router.post('/:id/publish', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.publishHandler));

// Applying is the student's own act.
router.post('/:id/applications', authorize('student'), asyncHandler(ctrl.applyHandler));

export default router;
