import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './tasks.controller';

const router = Router();

// Every role has a to-do list; the service decides whose list may be read or
// written, so there is no role guard here beyond being signed in.
router.use(authenticate);

router.get('/', asyncHandler(ctrl.listHandler));
router.post('/', asyncHandler(ctrl.createHandler));
router.patch('/:id', asyncHandler(ctrl.updateHandler));
router.delete('/:id', asyncHandler(ctrl.removeHandler));

export default router;
