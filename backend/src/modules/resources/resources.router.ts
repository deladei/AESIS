import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './resources.controller';

const router = Router();
router.use(authenticate);

// Everyone reads the shelf; the service filters it to their role's audience.
router.get('/', asyncHandler(ctrl.listHandler));

// Curation is a coordinator job.
router.post('/', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.createHandler));
router.delete('/:id', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.archiveHandler));

export default router;
