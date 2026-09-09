import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './resources.controller';

const router = Router();
router.use(authenticate);

// Everyone reads the shelf; the service filters it to their role's audience.
router.get('/', asyncHandler(ctrl.listHandler));

// Curation is a coordinator job. `manage` is listed before nothing else, but is
// kept above the id routes so it can never be read as a resource id.
router.get('/manage', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.listManagedHandler));
router.post('/', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.createHandler));
router.post(
  '/upload',
  authorize('coordinator', 'hod', 'admin'),
  ctrl.resourceUpload.single('file'),
  asyncHandler(ctrl.uploadHandler),
);
router.patch('/:id/publish', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.publishHandler));
router.delete('/:id', authorize('coordinator', 'hod', 'admin'), asyncHandler(ctrl.archiveHandler));

export default router;
